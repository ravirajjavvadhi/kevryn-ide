// ============================================================
// PERFORMANCE: Silence verbose logs in production
// ============================================================
// [TEMPORARILY DISABLED FOR DEBUGGING 502 ERROR]
/*
if (process.env.NODE_ENV === 'production') {
    const _originalLog = console.log;
    console.log = (...args) => {
        // Only allow [BOOT], [ERROR] and critical messages through
        const msg = args[0]?.toString() || '';
        if (msg.startsWith('[BOOT') || msg.startsWith('🚀') || msg.startsWith('❌')) {
            _originalLog(...args);
        }
    };
}
*/
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const compression = require('compression');

// ============================================================
// BOOT SEQUENCE: Start listening early to pass Railway health checks
// ============================================================
const initialPort = process.env.PORT;
require('dotenv').config();
const PORT = initialPort || process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);

// server.listen(PORT, '0.0.0.0', ...); // MOVED TO BOTTOM

process.on('uncaughtException', (err) => {
    console.error('FATAL: Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('FATAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// node-pty is a native module â€” load it optionally so server boots on Railway even without native compilation
let pty;
try {
    pty = require('node-pty');
    console.log('[PTY] node-pty loaded successfully');
} catch (e) {
    console.warn('[PTY] node-pty not available (native compile failed). Terminal features disabled:', e.message);
    pty = null;
}
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { spawn, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const { OAuth2Client } = require('google-auth-library');
// --- DIRECT AUTH REPLACEMENTS ---
// Removed Passport & Sessions for a cleaner, stateless API approach

// --- ENV VARS ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:5000/auth/github/callback';
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_123';

// Helper to strip Bearer prefix
const getCleanToken = (header) => {
    if (!header) return null;
    return header.startsWith('Bearer ') ? header.slice(7) : header;
};
const SESSION_SECRET = process.env.SESSION_SECRET || 'kevryn_session_secret';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
// Railway Fix: Prefer initialPort (from environment) over potential .env overrides
// (Declared at top of file)

// Initialize Google OAuth2 client (lazy - created on first auth attempt)
let _googleClient = null;
const getGoogleClient = () => {
    if (!_googleClient && GOOGLE_CLIENT_ID) {
        _googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
    }
    return _googleClient;
};

const cookieParser = require('cookie-parser');

const User = require('./User');
const File = require('./File');
const Submission = require('./models/Submission');
const LabSession = require('./LabSessionModel');
const LabReport = require('./models/LabReport'); // NEW: Phase 11
const FileHistory = require('./FileHistory');
const Message = require('./Message');
const Snippet = require('./Snippet');
const Course = require('./models/Course'); // NEW: For report roster
const Batch = require('./models/Batch');   // NEW: For report roster
const aiRouter = require('./routes/ai');
const adminRouter = require('./routes/admin'); // NEW: Admin Dashboard
const issuesRouter = require('./routes/issues'); // NEW: Issue Reporting
const collegeRouter = require('./routes/college'); // NEW: Multi-College Tenancy
const College = require('./models/College'); // NEW: College Model
const DeployManager = require('./deploy/DeployManager');
const { createProxyMiddleware } = require('http-proxy-middleware');
const courseManager = require('./routes/courseManager');
const assignmentManager = require('./routes/assignmentManager');

app.set('trust proxy', true);

// --- GLOBAL STATE ---
let io;
const liveLabState = {};
const socketToUser = {};
const offlineTimeouts = {}; // { username: timeoutId } - Grace period for refreshes

// PERFORMANCE: In-memory user ID cache to avoid repeated DB lookups
// Maps username -> { _id, courseName, courseId } for heartbeat optimization
const userIdCache = {}; // { username: { userId, expiry } }
const USER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// PERFORMANCE: Heartbeat batch write queue
// Instead of writing to DB on every heartbeat, queue and flush every 60 seconds
const heartbeatWriteQueue = {}; // { `${studentId}:${courseName}`: { report fields } }
let heartbeatFlushTimer = null;

const flushHeartbeatQueue = async () => {
    const keys = Object.keys(heartbeatWriteQueue);
    if (keys.length === 0) return;

    const batch = { ...heartbeatWriteQueue };
    // Clear the queue immediately so new data can accumulate
    Object.keys(heartbeatWriteQueue).forEach(k => delete heartbeatWriteQueue[k]);

    for (const key of keys) {
        try {
            const data = batch[key];
            await LabReport.findOneAndUpdate(
                { studentId: data.studentId, courseName: data.courseName },
                {
                    $inc: { totalTimeSpent: data.timeAccumulated },
                    $set: {
                        lastActive: new Date(),
                        tabSwitchCount: data.tabSwitchCount,
                        pasteCount: data.pasteCount,
                        attentionScore: data.attentionScore
                    }
                },
                { upsert: true }
            );
        } catch (e) {
            // Silent fail - don't let flush errors affect users
        }
    }
};

// server instance already created at line 26

// RAW HTTP LOGGER disabled in production - was causing I/O overhead on every request
// Uncomment below for debugging only:
// server.on('request', (req, res) => {
//     if (req.url !== '/health' && req.url !== '/ready') {
//         console.log(`[RAW REQUEST] ${new Date().toISOString()} | ${req.method} ${req.url}`);
//     }
// });

// --- SOCKET INITIALIZATION ---
io = new Server(server, {
    cors: {
        origin: true,
        methods: ["GET", "POST"],
        credentials: true
    }
});

server.on('error', (err) => {
    console.error('!!! SERVER ERROR !!!', err);
});

// server.listen moved to bottom to ensure all routes are ready before accepting traffic


// --- LOUD HEALTH CHECKS ---
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/ready', (req, res) => res.status(200).send('READY'));
app.get('/', (req, res) => {
    console.log(`[${new Date().toISOString()}] !!! ROOT HIT !!!`);
    res.send('Kevryn Server is Online');
});

// --- REQUEST LOGGING ---
app.use((req, res, next) => {
    if (req.url !== '/health' && req.url !== '/ready') {
        console.log(`[TRAFFIC] ${req.method} ${req.url}`);
    }
    next();
});

// --- RATE LIMITING ---
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 attempts per window
    message: { error: 'Too many attempts, please try again later.' }
});
const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 AI requests per minute
    message: { error: 'AI rate limit exceeded. Please wait a moment.' }
});

// --- APPLY RATE LIMITERS EARLY ---
app.use('/auth', authLimiter);
app.use('/ai', aiLimiter);


// --- CORS & SECURITY MIDDLEWARE ---
// Explicitly handling CORS for Railway & Netlify production
const allowedOrigins = [
    'https://kevryn.netlify.app',
    'https://kevryn-ide.netlify.app',
    'http://localhost:3000',
    'http://localhost:3001',
    // Cloudflare Pages deployments (preview + production)
    /^https:\/\/.*\.kevryn-ide\.pages\.dev$/,
    /^https:\/\/.*\.pages\.dev$/,
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.) or known origins
        if (!origin) return callback(null, true);
        const isAllowed = allowedOrigins.some(o =>
            typeof o === 'string' ? o === origin : o.test(origin)
        );
        if (isAllowed) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked origin: ${origin}`);
            callback(null, true); // Allow anyway (permissive for debug)
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// --- CRITICAL DEBUG ROUTES (Top Level) ---
app.get('/debug-ping', (req, res) => res.json({
    status: 'online',
    time: new Date(),
    env: process.env.NODE_ENV,
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
}));
app.get('/debug-auth-public', (req, res) => {
    const rawHeader = req.headers.authorization || 'None';
    res.json({
        authHeaderPresent: !!req.headers.authorization,
        authHeaderStart: rawHeader.substring(0, 20) + '...',
        cleanTokenStart: getCleanToken(rawHeader)?.substring(0, 20) + '...'
    });
});

// --- WEBCONTAINER SECURITY HEADERS (only for non-API routes) ---
app.use((req, res, next) => {
    // Only set COOP/COEP for the root/app pages, NOT API routes or Previews
    // These headers break cross-origin API calls and external asset loading in previews
    if (
        !req.path.startsWith('/auth') &&
        !req.path.startsWith('/api') &&
        !req.path.startsWith('/files') &&
        !req.path.startsWith('/run-code') &&
        !req.path.startsWith('/preview')
    ) {
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- SESSION & PASSPORT REMOVED ---
// We are now using stateless JWT authentication.
// No session or passport middlewares required.

// --- DIRECT GITHUB AUTH CONFIG ---
// Passport strategies removed in favor of direct API calls.

// --- AUTH MIDDLEWARE ---
const { authenticate } = require('./utils/authMiddleware');

// --- AUTH ROUTES ---
app.post('/auth/register', async (req, res) => {
    try {
        const { username, password, email, role, collegeCode } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Username and password required" });

        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: "Username taken" });

        // Optional: Auto-join college if code provided during registration
        let collegeId = null;
        let collegeName = null;
        if (collegeCode) {
            const college = await College.findOne({ code: collegeCode.toUpperCase().trim(), isActive: true });
            if (college) {
                collegeId = college._id;
                collegeName = college.name;
            }
            // If invalid code, silently ignore — user can join later
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            username,
            password: hashedPassword,
            email,
            role: role || 'student',
            collegeId: collegeId || undefined
        });
        await user.save();

        const token = jwt.sign({ userId: user._id, username: user.username, role: user.role, collegeId: user.collegeId || null }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user: { _id: user._id, username: user.username, role: user.role, picture: user.picture, collegeId: user.collegeId || null, collegeName } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/auth/user', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- API ROUTES ---
app.use('/api', courseManager);
app.use('/api/assignments', assignmentManager);
app.use('/api/admin', adminRouter); // NEW: Admin API
app.use('/api/issues', issuesRouter); // NEW: Issue Reporting
app.use('/api', collegeRouter); // NEW: Multi-College Routes (/api/college/join, /api/admin/colleges)
app.use('/ai', aiRouter); // Mount AI routes

// --- OAUTH ROUTES ---

// FIX: Move /files to top to ensure it's registered before server starts listening or broad routers match
app.get('/files', authenticate, async (req, res) => {
    try {
        const { courseId } = req.query;
        const userId = req.user.userId;
        const username = req.user.username;

        const ownerId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

        // Build the base ownership filter
        const ownerFilter = {
            $or: [
                { owner: ownerId },
                { owner: userId }, // String fallback
                { sharedWith: username }
            ]
        };

        let query;

        if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
            // Lab file: filter by the specific courseId
            query = {
                $and: [
                    ownerFilter,
                    { courseId: new mongoose.Types.ObjectId(courseId) }
                ]
            };
        } else {
            // Personal workspace files: courseId must be absent/null
            query = {
                $and: [
                    ownerFilter,
                    {
                        $or: [
                            { courseId: { $exists: false } },
                            { courseId: null }
                        ]
                    }
                ]
            };
        }

        console.log(`[FILES] Query for ${username} (${userId}):`, JSON.stringify(query, null, 2));

        const files = await File.find(query)
            .select('name type parentId content owner sharedWith courseId lastActivity')
            .lean();

        console.log(`[FILES] Found ${files.length} files for ${username}`);
        res.json(files);
    } catch (err) {
        console.error("[FILES ERROR]", err.message, err.stack);
        res.status(500).json({ error: "Error fetching files", detail: err.message });
    }
});

// --- MODERN DIRECT OAUTH ROUTES ---

// Google Login (ID Token Verification)
app.post('/auth/google', async (req, res) => {
    try {
        const { token } = req.body;
        const ticket = await getGoogleClient().verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub, email, name, picture } = payload;

        let user = await User.findOne({ email });
        if (!user) {
            user = new User({
                username: name || email.split('@')[0],
                email,
                googleId: sub,
                picture,
                role: 'student'
            });
            await user.save();
        }

        // Admin Overrides
        if (user.email === 'prsnlkalyan@gmail.com') { user.role = 'admin'; user.username = 'P KALYAN REDDY'; }

        const jwtToken = jwt.sign({ userId: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token: jwtToken, username: user.username, userId: user._id, picture: user.picture, role: user.role });
    } catch (e) {
        res.status(500).json({ error: "Google Auth Failed" });
    }
});

// GitHub Direct API Login (No Passport)
app.get('/auth/github', (req, res) => {
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=user:email`;
    res.redirect(githubAuthUrl);
});

app.get('/auth/github/callback', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) return res.redirect(`${CLIENT_URL}/login?error=no_code`);

        // 1. Exchange code for access token
        const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code
        }, { headers: { Accept: 'application/json' } });

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) throw new Error("Failed to get access token");

        // 2. Get User Info from GitHub
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `token ${accessToken}` }
        });

        const profile = userResponse.data;
        let user = await User.findOne({ githubId: profile.id.toString() });

        if (!user) {
            user = new User({
                username: profile.login || profile.name,
                githubId: profile.id.toString(),
                picture: profile.avatar_url,
                role: 'student'
            });
            await user.save();
        }

        const token = jwt.sign({ userId: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.redirect(`${CLIENT_URL}?token=${token}&username=${encodeURIComponent(user.username)}&userId=${user._id}&role=${user.role}&picture=${encodeURIComponent(user.picture || '')}`);
    } catch (e) {
        console.error("GitHub Auth Error:", e);
        res.redirect(`${CLIENT_URL}/login?error=auth_failed`);
    }
});

// 1. Create Session (Faculty Only)
app.post('/lab/create-session', authenticate, async (req, res) => {
    try {
        const { sessionName, subject, semester, allowedStudents, courseId, batchId, duration } = req.body;
        const facultyId = req.user.userId; // Securely take from token
        const collegeId = req.user.collegeId;


        let whitelistedStudents = allowedStudents || [];
        console.log(`[Lab] Creating session: ${sessionName}, BatchID: ${batchId}, CourseID: ${courseId}`);

        // NEW: If batchId is provided, pull students from the Batch roster (Higher priority than Course)
        if (batchId) {
            const batch = await Batch.findById(batchId);
            if (batch && batch.students) {
                whitelistedStudents = batch.students.map(s => s.username);
                console.log(`[Lab] Found Batch students: ${whitelistedStudents.join(', ')}`);
            } else {
                console.log(`[Lab] Batch not found or no students in batch ${batchId}`);
            }
        } else if (courseId) {
            // Fallback to Course roster if no Batch is selected
            const course = await Course.findById(courseId);
            if (course && course.enrolledStudents) {
                whitelistedStudents = course.enrolledStudents;
                console.log(`[Lab] Found Course students: ${whitelistedStudents.join(', ')}`);
            }
        }

        console.log(`[Lab] Final whitelisted students: ${whitelistedStudents.length}`);

        const session = new LabSession({
            facultyId,
            collegeId: collegeId || undefined,
            courseId,
            batchId,
            sessionName,
            subject: subject || 'General',
            semester: semester || 'Sem 1',
            duration: duration || 60,
            allowedStudents: whitelistedStudents

        });
        await session.save();
        io.emit('session-started', session); // Notify all students
        res.json({ success: true, session });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1.5 Get Active Session (Resume)
app.get('/lab/active-session', authenticate, async (req, res) => {
    try {
        const query = { facultyId: req.user.userId, isActive: true };
        if (req.user.collegeId) query.collegeId = req.user.collegeId;

        // Find the most recent active session for this faculty
        const session = await LabSession.findOne(query).sort({ startTime: -1 });

        console.log(`[DIAGNOSTIC] FETCH ACTIVE SESSION for ${req.user.userId}: ${session ? session._id : 'none'}`);
        res.json({ session });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1.5.1 Get Active Session (Student Check)
app.get('/lab/student/active-session', authenticate, async (req, res) => {
    try {
        const query = { isActive: true, allowedStudents: req.user.username };
        // If student is bound to a college, they can only see sessions from their college
        if (req.user.collegeId) query.collegeId = req.user.collegeId;

        // Find an active session where this student is whitelisted
        const session = await LabSession.findOne(query).sort({ startTime: -1 });

        res.json({ session });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1.6 End Active Session (Close ALL active sessions for this faculty)
app.post('/lab/end-session', authenticate, async (req, res) => {
    try {
        // Find ALL active sessions for this faculty
        const sessions = await LabSession.find({ facultyId: req.user.userId, isActive: true });
        console.log(`[DIAGNOSTIC] ENDING SESSIONS for faculty ${req.user.userId}. Found: ${sessions.length}`);

        if (sessions.length > 0) {
            // Update all to inactive
            const result = await LabSession.updateMany(
                { facultyId: req.user.userId, isActive: true },
                { isActive: false, endTime: new Date() }
            );
            console.log(`[DIAGNOSTIC] UPDATE RESULT: modified ${result.modifiedCount} sessions`);

            // Broadcast session-ended GLOBALLY...
            sessions.forEach(s => {
                // Clear live state...
                if (liveLabState[s._id]) delete liveLabState[s._id];
                console.log(`[DIAGNOSTIC] EXPLICIT END-SESSION: Emitting session-ended for ${s._id}`);
                io.emit('session-ended', { sessionId: s._id });
            });
        }
        res.json({ success: true, message: "All active sessions ended" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// --- Course Roster Management (Phase 18) ---

// Enroll a student in a course
app.post('/course/:id/enroll', authenticate, async (req, res) => {
    try {
        const { username } = req.body;
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ error: "Course not found" });

        if (!course.enrolledStudents.includes(username)) {
            course.enrolledStudents.push(username);
            await course.save();
        }
        res.json({ success: true, enrolledStudents: course.enrolledStudents });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Unenroll a student from a course
app.delete('/course/:id/enroll/:username', authenticate, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ error: "Course not found" });

        course.enrolledStudents = course.enrolledStudents.filter(u => u !== req.params.username);
        await course.save();
        res.json({ success: true, enrolledStudents: course.enrolledStudents });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get course roster
app.get('/course/:id/roster', authenticate, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ error: "Course not found" });
        res.json({ enrolledStudents: course.enrolledStudents || [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// 1.7 Update Student Report (Timer/Code Save)
app.post('/lab/update-report', authenticate, async (req, res) => {
    try {
        const { courseId, courseName, fileName, code, timeSpent, status } = req.body;
        const studentId = req.user.userId;

        let report = await LabReport.findOne({ studentId, courseName });
        if (!report) {
            report = new LabReport({ studentId, courseId, courseName, files: [] });
        }

        const fileIndex = report.files.findIndex(f => f.fileName === fileName);
        if (fileIndex > -1) {
            report.files[fileIndex].code = code;
            report.files[fileIndex].timeSpent += timeSpent; // Increment cumulative time
            report.files[fileIndex].lastUpdated = new Date();
            if (status) report.files[fileIndex].status = status;
        } else {
            report.files.push({ fileName, code, timeSpent, status: status || 'in-progress' });
        }

        report.totalTimeSpent += timeSpent; // Increment global time
        report.lastActive = new Date();
        await report.save();

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1.8 Get Course Reports (Faculty View) — PERFORMANCE OPTIMIZED
app.get('/lab/reports/:courseId', authenticate, async (req, res) => {
    try {
        const courseId = req.params.courseId;

        // PERFORMANCE: Use lean() throughout — read-only ops should never load Mongoose docs
        const course = await Course.findById(courseId).lean();

        let enrolledStudents = [];

        if (course) {
            const batches = await Batch.find({ courseId: course._id }).lean();
            batches.forEach(b => {
                b.students.forEach(s => {
                    if (!enrolledStudents.find(e => e.username === s.username)) {
                        enrolledStudents.push({ username: s.username, email: s.email, picture: null });
                    }
                });
            });
        }

        const reports = await LabReport.find({ courseName: course.name })
            .populate('studentId', 'username picture email')
            .lean();

        // PERFORMANCE: Find all unmatched students with ONE bulk query instead of N User.findOne() calls
        const matchedUsernames = new Set(reports.map(r => r.studentId?.username).filter(Boolean));
        const unmatchedUsernames = enrolledStudents
            .filter(s => !matchedUsernames.has(s.username))
            .map(s => s.username);

        // Single bulk user lookup
        const missingUsers = unmatchedUsernames.length > 0
            ? await User.find({ username: { $in: unmatchedUsernames } }).select('username picture email').lean()
            : [];
        const missingUsersMap = Object.fromEntries(missingUsers.map(u => [u.username, u]));

        const mergedReports = [
            ...reports,
            ...unmatchedUsernames.map(username => ({
                _id: 'temp_' + username,
                studentId: missingUsersMap[username] || { username, picture: null },
                courseName: course.name,
                totalTimeSpent: 0,
                lastActive: null,
                files: []
            }))
        ];

        res.json(mergedReports);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1.9 Get Specific Student Report
app.get('/lab/report/:studentId/:courseName', authenticate, async (req, res) => {
    try {
        const report = await LabReport.findOne({
            studentId: req.params.studentId,
            courseName: req.params.courseName
        });
        res.json(report || { files: [], totalTimeSpent: 0 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Add Student to Session (Register)
app.post('/lab/add-student', authenticate, async (req, res) => {
    try {
        const { sessionId, username } = req.body;
        const session = await LabSession.findById(sessionId);
        if (!session) return res.status(404).json({ error: "Session not found" });

        if (!session.allowedStudents.includes(username)) {
            session.allowedStudents.push(username);
            await session.save();
        }

        // Remove student from any OTHER active sessions to prevent session mismatch
        await LabSession.updateMany(
            { _id: { $ne: sessionId }, isActive: true, allowedStudents: username },
            { $pull: { allowedStudents: username, activeStudents: { username } } }
        );
        console.log(`[LAB] Ensured ${username} is only in session ${sessionId}`);

        // Add to activeStudents if not present
        const existingActive = session.activeStudents.find(s => s.username === username);
        if (!existingActive) {
            session.activeStudents.push({
                username,
                loginTime: new Date(),
                lastHeartbeat: new Date(),
                currentStatus: 'active'
            });
            await session.save();
        }

        res.json({ success: true, message: "Student added" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Heartbeat (Student Pulse) — PERFORMANCE OPTIMIZED
// Previously: 4-6 DB ops per heartbeat call. Now: 1 DB op + in-memory queue.
app.post('/lab/heartbeat', async (req, res) => {
    try {
        const { sessionId, username, status, activeFile, code } = req.body;
        if (!sessionId || !username) return res.status(400).json({ error: "sessionId and username required" });

        // PERFORMANCE: Use lean() to get a plain JS object - faster than Mongoose document
        // Only update the specific student's heartbeat using $set on array element
        const session = await LabSession.findById(sessionId).lean();
        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        // PERFORMANCE: Use updateOne instead of findById + save (avoids loading the entire document)
        const studentExists = session.activeStudents?.some(s => s.username === username);
        if (studentExists) {
            // Just update the heartbeat timestamp using positional operator
            await LabSession.updateOne(
                { _id: sessionId, 'activeStudents.username': username },
                { $set: { 'activeStudents.$.lastHeartbeat': new Date(), 'activeStudents.$.currentStatus': status || 'active' } }
            );
        } else {
            // New student - push to array
            await LabSession.updateOne(
                { _id: sessionId },
                { $push: { activeStudents: { username, loginTime: new Date(), lastHeartbeat: new Date(), currentStatus: status || 'active' } } }
            );
        }

        // Update in-memory Live State (no DB needed)
        if (!liveLabState[sessionId]) liveLabState[sessionId] = {};
        const currentLiveState = liveLabState[sessionId][username] || {};

        // LOCKDOWN: If student explicitly left, do NOT revive to active via heartbeat
        if (currentLiveState.explicitlyLeft) {
            return res.status(200).json({ status: 'offline', explicitlyLeft: true });
        }

        liveLabState[sessionId][username] = {
            ...currentLiveState,
            username,
            status: status || 'active',
            lastActive: new Date().toLocaleTimeString(),
            lastHeartbeat: new Date(),
            code: code || currentLiveState.code || '',
            activeFile: activeFile || currentLiveState.activeFile || null,
            language: currentLiveState.language || 'javascript'
        };

        // Broadcast live state to faculty via socket
        if (io) io.to(`lab-${sessionId}`).emit('student-data-update', liveLabState[sessionId][username]);

        // --- PERFORMANCE: QUEUE report update (no immediate DB write, flush every 60s) ---
        if (status === 'active') {
            try {
                let studentDbId = liveLabState[sessionId]?.[username]?._dbId;
                let courseName = liveLabState[sessionId]?._courseName;

                // Resolve user ID from in-memory cache (DB hit only once per 10 min per user)
                if (!studentDbId) {
                    const cached = userIdCache[username];
                    if (cached && cached.expiry > Date.now()) {
                        studentDbId = cached.userId;
                    } else {
                        const user = await User.findOne({ username }).select('_id').lean();
                        if (user) {
                            studentDbId = user._id;
                            userIdCache[username] = { userId: user._id, expiry: Date.now() + USER_CACHE_TTL };
                            if (liveLabState[sessionId]?.[username]) liveLabState[sessionId][username]._dbId = user._id;
                        }
                    }
                }

                // Resolve courseName from cache or session (avoid populate on every heartbeat)
                if (!courseName) {
                    const fullSession = await LabSession.findById(sessionId).populate('courseId', 'name').lean();
                    courseName = fullSession?.courseId?.name || fullSession?.subject || 'General';
                    if (liveLabState[sessionId]) liveLabState[sessionId]._courseName = courseName;
                }

                if (studentDbId && courseName) {
                    const queueKey = `${studentDbId}:${courseName}`;
                    const liveData = liveLabState[sessionId]?.[username] || {};
                    const existing = heartbeatWriteQueue[queueKey] || { studentId: studentDbId, courseName, timeAccumulated: 0 };
                    heartbeatWriteQueue[queueKey] = {
                        ...existing,
                        timeAccumulated: existing.timeAccumulated + 10,
                        tabSwitchCount: liveData.tabSwitchCount || 0,
                        pasteCount: liveData.pasteCount || 0,
                        attentionScore: liveData.attentionScore || 100,
                    };
                }
            } catch (e) { /* silent — don't affect response time */ }
        }

        res.json({ success: true });
    } catch (e) {
        console.error("Heartbeat Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// 4. Get Session Details
app.get('/lab/session/:id', async (req, res) => {
    try {
        const session = await LabSession.findById(req.params.id);
        res.json(session);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Get Session Details
app.get('/api/users/students', authenticate, async (req, res) => {
    try {
        const students = await User.find({ role: 'student' }).select('username _id');
        res.json(students);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- UNIFIED VAYU LAB SYSTEM ROUTES ---

// 5. Get Student's Files (for faculty monitoring)
app.get('/lab/student-files/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'Student not found' });
        const files = await File.find({ owner: user._id }).select('name content updatedAt createdAt');
        res.json(files || []);
    } catch (e) {
        console.error('[LAB] Student files error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// 4. Get Student's Active Session (most recent)
app.get('/lab/student/active-session', authenticate, async (req, res) => {
    try {
        const session = await LabSession.findOne({
            allowedStudents: req.user.username,
            isActive: true
        }).sort({ createdAt: -1 }); // Get the MOST RECENT active session
        console.log(`[LAB] Active session for ${req.user.username}: ${session?._id || 'none'}`);
        res.json({ session });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. Get Student Portfolio (History & Stats by Subject)
app.get('/lab/student-portfolio/:username', async (req, res) => {
    try {
        const { username } = req.params;
        // Find all sessions where this student was active or allowed
        const sessions = await LabSession.find({
            $or: [{ activeStudents: { $elemMatch: { username } } }, { allowedStudents: username }]
        }).sort({ startTime: -1 });

        // Group by Subject
        const tracks = {};
        sessions.forEach(s => {
            const subj = s.subject || 'General';
            if (!tracks[subj]) tracks[subj] = { subject: subj, sessions: [], totalLabs: 0, attended: 0, totalTime: 0 };

            const studentData = s.activeStudents.find(as => as.username === username);
            const attended = !!studentData;
            const duration = attended && studentData.lastHeartbeat ? (new Date(studentData.lastHeartbeat) - new Date(studentData.loginTime)) / 60000 : 0; // minutes

            tracks[subj].totalLabs++;
            if (attended) tracks[subj].attended++;
            tracks[subj].totalTime += duration;

            tracks[subj].sessions.push({
                sessionName: s.sessionName,
                date: s.startTime,
                attended,
                duration: Math.round(duration),
                status: studentData?.currentStatus || 'absent'
            });
        });

        res.json({ username, tracks });
    } catch (e) {
        console.error('[LAB] Portfolio error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// --- PROXY MIDDLEWARE FOR DEPLOYMENTS ---
// Dynamic proxy matching /deployed/:projectId/*
app.use('/deployed/:projectId', (req, res, next) => {
    const projectId = req.params.projectId;
    const deployment = DeployManager.getDeployment(projectId);

    if (!deployment || deployment.status !== 'running') {
        return res.status(404).send(`Deployment '${projectId}' is not running.`);
    }

    return createProxyMiddleware({
        target: `http://localhost:${deployment.port}`,
        changeOrigin: true,
        ws: true, // Support Websockets
        pathRewrite: {
            [`^/deployed/${projectId}`]: '',
        },
        onError: (err, req, res) => {
            console.error('Proxy Error:', err);
            res.status(500).send('Proxy Error');
        }
    })(req, res, next);
});

// (Rate limiters moved to top)

const baseUserDir = path.join(__dirname, 'user_projects');
const baseSitesDir = path.join(__dirname, 'public_sites');

// --- AUTH MIDDLEWARE ---
// (Auth middleware moved to top)


if (!fs.existsSync(baseUserDir)) fs.mkdirSync(baseUserDir, { recursive: true });
if (!fs.existsSync(baseSitesDir)) fs.mkdirSync(baseSitesDir, { recursive: true });

// Helper: get per-user directories
function getUserDir(userId) {
    const dir = path.join(baseUserDir, userId.toString());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// NEW Helper: get per-lab directories for isolation
// NEW Helper: get per-lab directories for isolation
function getLabDir(userId, courseId) {
    const userDir = getUserDir(userId);
    // FIX: robust check for undefined string
    if (!courseId || courseId === 'undefined' || courseId === 'null') return userDir;
    const labDir = path.join(userDir, 'labs', courseId.toString());
    if (!fs.existsSync(labDir)) fs.mkdirSync(labDir, { recursive: true });
    return labDir;
}






// Hierarchical Path Helper
async function getFileRelativePath(fileId) {
    if (!fileId || fileId === 'root') return "";
    try {
        const file = await File.findById(fileId);
        if (!file) return "";
        const parentPath = await getFileRelativePath(file.parentId);
        return path.join(parentPath, file.name);
    } catch (e) { return ""; }
}

function getUserSitesDir(userId) {
    const dir = path.join(baseSitesDir, userId.toString());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// Serve static files per user
app.use('/preview/:userId', (req, res, next) => {
    const dir = path.join(baseUserDir, req.params.userId);
    if (!req.url.endsWith('/') && !req.url.includes('.')) {
        console.log(`[PREVIEW] Serving folder or malformed path: ${req.url} from ${dir}`);
    }
    // console.log(`[PREVIEW] Request: ${req.url} | Base: ${dir}`);
    express.static(dir)(req, res, next);
});

// ============================================================
// FINAL BOOT: Start listening BEFORE heavy DB/logic to pass healthchecks
// ============================================================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [BOOT] Server online on port ${PORT}`);
});

// --- DB CONNECTION ---
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log(`🚀 SUCCESS: Connected to MongoDB`);

        // CLEANUP: Reset all students to 'offline' on server restart
        // This prevents "ghost" active students if the server crashed/restarted while they were online.
        try {
            const result = await LabSession.updateMany(
                { "activeStudents.currentStatus": "active" },
                { $set: { "activeStudents.$[].currentStatus": "offline" } }
            );
            console.log(`[CLEANUP] Reset ${result.modifiedCount} active sessions to offline state.`);
        } catch (e) {
            console.error("[CLEANUP] Failed to reset student statuses:", e);
        }

        // ============================================================
        // PERFORMANCE FIX 1: Start heartbeat batch flush every 60 seconds
        // Instead of writing DB on every heartbeat, we batch & flush here.
        // ============================================================
        heartbeatFlushTimer = setInterval(async () => {
            try { await flushHeartbeatQueue(); } catch (e) { /* silent */ }
        }, 60 * 1000); // Every 60 seconds
        console.log('[PERF] Heartbeat batch flush timer started (60s interval)');

        // ============================================================
        // PERFORMANCE FIX 2: Keep-alive self-ping to prevent Railway cold starts
        // Railway shuts down free servers after ~15 min of inactivity.
        // This ping keeps the server warm, eliminating 5-15 second cold start delays.
        // ============================================================
        const SELF_URL = process.env.RAILWAY_STATIC_URL
            ? `https://${process.env.RAILWAY_STATIC_URL}/health`
            : `http://localhost:${PORT}/health`;

        setInterval(async () => {
            try {
                const http_module = require('http');
                const https_module = require('https');
                const mod = SELF_URL.startsWith('https') ? https_module : http_module;
                mod.get(SELF_URL, (r) => { /* ping successful */ }).on('error', () => { /* silent */ });
            } catch (e) { /* silent */ }
        }, 14 * 60 * 1000); // Every 14 minutes (before Railway's 15-min timeout)
        console.log(`[PERF] Keep-alive self-ping started (14min interval) → ${SELF_URL}`);

        // ============================================================
        // PERFORMANCE FIX 3: Hourly user cache cleanup (prevent memory leaks)
        // ============================================================
        setInterval(() => {
            const now = Date.now();
            Object.keys(userIdCache).forEach(k => {
                if (userIdCache[k].expiry < now) delete userIdCache[k];
            });
        }, 60 * 60 * 1000); // Every hour

    })
    .catch(err => console.error("❌ FAILURE: MongoDB Connection Error:", err.message));

// activeDeployments and nextPort removed in favor of DeployManager


// --- MIDDLEWARE ---

function copyFolderSync(from, to) {
    if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(element => {
        if (fs.lstatSync(path.join(from, element)).isFile()) {
            fs.copyFileSync(path.join(from, element), path.join(to, element));
        } else {
            copyFolderSync(path.join(from, element), path.join(to, element));
        }
    });
}

// Load saved deployments on startup
// Load saved deployments on startup
try {
    DeployManager.loadState();
} catch (e) {
    console.error("[DeployManager] Failed to load state on startup:", e);
}

// Import Report Generator
const { generateLabReport } = require('./utils/reportGenerator');

// 5. Generate Individual Student Report (PDF)
app.get('/lab/report/:sessionId/:username', async (req, res) => {
    try {
        const { sessionId, username } = req.params;
        await generateLabReport(sessionId, username, res);
    } catch (e) {
        console.error("Report Route Error:", e);
        res.status(500).send("Report generation failed");
    }
});

// --- DEPLOYMENT ROUTES ---
app.post('/deploy/frontend', authenticate, async (req, res) => {
    console.log("ðŸš€ Deploy Frontend Request received from:", req.user.username);
    const username = req.user.username;
    const userId = req.user.userId;
    const { siteName, backendUrl, courseId } = req.body; // NEW: Accept courseId

    const userDir = courseId ? getLabDir(userId, courseId) : getUserDir(userId);
    const userSitesDir = getUserSitesDir(userId);

    // Use custom site name if provided, else username
    const safeSiteName = siteName ? siteName.replace(/[^a-z0-9-_]/gi, '') : username;
    if (!safeSiteName) return res.status(400).json({ error: "Invalid site name" });

    const deployPath = path.join(userSitesDir, safeSiteName);

    try {
        if (fs.existsSync(deployPath)) {
            fs.rmSync(deployPath, { recursive: true, force: true });
        }

        let sourceDir = userDir;

        // --- PRE-FLIGHT SYNC: Ensure files exist on disk ---
        console.log(`[Deploy] Pre-flight sync for user ${userId} in context ${courseId || 'root'}...`);

        // Filter DB files by courseId to avoid mixing lab vs portfolio files
        const query = {
            $or: [{ owner: userId }, { sharedWith: username }]
        };
        if (courseId) {
            query.courseId = courseId;
        } else {
            query.courseId = { $exists: false };
        }

        const dbFiles = await File.find(query);
        if (dbFiles.length > 0) {
            for (const file of dbFiles) {
                const relPath = await getFileRelativePath(file._id);
                if (!relPath) continue;
                const fullPath = path.join(userDir, relPath);
                if (file.type === 'folder') {
                    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
                } else if (!fs.existsSync(fullPath)) {
                    const dir = path.dirname(fullPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(fullPath, file.content || "");
                }
            }
        }

        // Better Project Detection: detailed scan
        // 1. Look for index.html (Favors static/frontend root)
        const indexFile = findEntryFileHelper(userDir, 'index.html', 0);
        if (indexFile) {
            console.log(`[Deploy] Found index.html at ${indexFile}`);
            sourceDir = path.dirname(indexFile);
        } else {
            // 2. Look for package.json
            const packageJson = findEntryFileHelper(userDir, 'package.json', 0);
            if (packageJson) {
                // Validate if it's a frontend project (has build script)
                const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
                if (pkg.scripts && pkg.scripts.build) {
                    console.log(`[Deploy] Found frontend package.json at ${packageJson}`);
                    sourceDir = path.dirname(packageJson);
                } else {
                    console.warn(`[Deploy] Found package.json at ${packageJson} but no 'build' script. Searching deeper...`);
                }
            }

            // 3. Fallback: Search deeply if no obvious root found or package.json was invalid
            if (sourceDir === userDir || (packageJson && sourceDir !== path.dirname(packageJson))) {
                console.warn("[Deploy] No clear project root. Searching deeply...");
                let deepFound = false;
                const subdirs = fs.readdirSync(userDir).filter(f => fs.statSync(path.join(userDir, f)).isDirectory());
                for (const sub of subdirs) {
                    const subPackage = path.join(userDir, sub, 'package.json');
                    const subIndex = path.join(userDir, sub, 'index.html');

                    // Prioritize frontend package.json (with build) or index.html
                    if (fs.existsSync(subIndex)) {
                        sourceDir = path.join(userDir, sub);
                        deepFound = true;
                        break;
                    }
                    if (fs.existsSync(subPackage)) {
                        const pkg = JSON.parse(fs.readFileSync(subPackage, 'utf8'));
                        if (pkg.scripts && pkg.scripts.build) {
                            sourceDir = path.join(userDir, sub);
                            deepFound = true;
                            break;
                        }
                    }

                    // Depth 2
                    const subsubdirs = fs.readdirSync(path.join(userDir, sub)).filter(f => fs.statSync(path.join(userDir, sub, f)).isDirectory());
                    for (const subsub of subsubdirs) {
                        const ssPackage = path.join(userDir, sub, subsub, 'package.json');
                        const ssIndex = path.join(userDir, sub, subsub, 'index.html');

                        if (fs.existsSync(ssIndex)) {
                            sourceDir = path.join(userDir, sub, subsub);
                            deepFound = true;
                            break;
                        }
                        if (fs.existsSync(ssPackage)) {
                            const pkg = JSON.parse(fs.readFileSync(ssPackage, 'utf8'));
                            if (pkg.scripts && pkg.scripts.build) {
                                sourceDir = path.join(userDir, sub, subsub);
                                deepFound = true;
                                break;
                            }
                        }
                    }
                    if (deepFound) break;
                }

                if (!deepFound && sourceDir === userDir) {
                    console.error("[Deploy] No project (valid package.json or index.html) found in user directory.");
                    return res.status(404).json({ error: "No frontend project found. Ensure your project has an index.html or a package.json with a 'build' script." });
                }
            }
        }

        // AUTO-BUILD LOGIC
        if (fs.existsSync(path.join(sourceDir, 'package.json'))) {
            console.log("[Deploy] Detected package.json, attempting build...");
            try {
                if (!fs.existsSync(path.join(sourceDir, 'node_modules'))) {
                    console.log("[Deploy] Installing dependencies...");
                    await execAsync('npm install', { cwd: sourceDir, timeout: 300000 });
                }
                let buildCmd = 'npm run build';
                if (fs.existsSync(path.join(sourceDir, 'vite.config.js'))) {
                    buildCmd += ' -- --base=./';
                }
                await execAsync(buildCmd, { cwd: sourceDir, timeout: 120000 });
                const dist = path.join(sourceDir, 'dist');
                const build = path.join(sourceDir, 'build');
                if (fs.existsSync(dist)) sourceDir = dist;
                else if (fs.existsSync(build)) sourceDir = build;
            } catch (e) {
                console.error("[Deploy] Build failed:", e);
                return res.status(500).json({ error: "Build failed: " + e.message });
            }
        }

        copyFolderSync(sourceDir, deployPath);

        if (backendUrl) {
            const indexPath = path.join(deployPath, 'index.html');
            if (fs.existsSync(indexPath)) {
                let html = fs.readFileSync(indexPath, 'utf8');
                const injection = `<script>window.KEVRYN_ENV = { BACKEND_URL: "${backendUrl}" };</script>`;
                if (html.includes('<head>')) {
                    html = html.replace('<head>', `<head>${injection}`);
                } else {
                    html = injection + html;
                }
                fs.writeFileSync(indexPath, html);
            }
        }

        const liveUrl = `/sites/${userId}/${safeSiteName}/index.html`;
        res.json({ message: "Frontend Deployed!", url: liveUrl });
    } catch (err) {
        console.error("Deploy Error:", err);
        res.status(500).json({ error: "Deployment failed" });
    }
});

// Helper to reconstruct file path from database parentId chain
async function getFileRelativePath(fileId) {
    if (!fileId || fileId === 'root') return "";
    const file = await File.findById(fileId);
    if (!file) return "";
    const parentPath = await getFileRelativePath(file.parentId);
    return path.join(parentPath, file.name);
}

// Helper to find file recursively (max depth 10)
function findEntryFileHelper(baseDir, entryRelativePath, depth = 0) {
    if (depth > 10) return null;
    try {
        const target = path.join(baseDir, entryRelativePath);
        if (fs.existsSync(target) && fs.statSync(target).isFile()) {
            console.log(`[Search] Found target: ${target}`);
            return target;
        }

        const items = fs.readdirSync(baseDir);
        for (const item of items) {
            const itemPath = path.join(baseDir, item);
            if (fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()) {
                // Skip common large/system folders
                if (['node_modules', '.git', '.next', 'dist', 'build', '.idea', '.vscode'].includes(item)) {
                    continue;
                }

                const found = findEntryFileHelper(itemPath, entryRelativePath, depth + 1);
                if (found) return found;
            }
        }
    } catch (e) { return null; }
    return null;
}

app.post('/deploy/backend', authenticate, async (req, res) => {
    console.log("ðŸš€ Deploy Backend Request received");
    const userId = req.user.userId;
    const { entryFile, courseId } = req.body; // NEW: Accept courseId
    const projectId = userId.toString();
    const userDir = courseId ? getLabDir(userId, courseId) : getUserDir(userId);

    let filePath = findEntryFileHelper(userDir, entryFile);

    // --- PRE-FLIGHT SYNC: If not found on disk, sync from MongoDB ---
    if (!filePath) {
        console.log(`[Deploy] Entry file ${entryFile} not found on disk. Checking MongoDB...`);
        const query = {
            name: entryFile,
            type: 'file',
            $or: [{ owner: userId }, { sharedWith: req.user.username }]
        };
        if (courseId) query.courseId = courseId;
        else query.courseId = { $exists: false };

        const dbFile = await File.findOne(query);

        if (dbFile) {
            console.log(`[Deploy] Found in DB. Syncing to disk...`);
            const relPath = await getFileRelativePath(dbFile._id);
            filePath = path.join(userDir, relPath);
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, dbFile.content || "");
        }
    }


    if (!filePath) {
        return res.status(404).json({ error: `File '${entryFile}' not found in project.` });
    }

    try {
        const projectPath = path.dirname(filePath);
        const cmd = `node "${path.basename(filePath)}"`;

        const result = await DeployManager.startDeployment(projectId, projectPath, cmd);
        res.json({
            message: "Backend Started!",
            url: `/deployed/${projectId}`,
            port: result.port
        });
    } catch (err) {
        console.error("Deploy Error:", err);
        res.status(500).json({ error: "Deployment failed: " + err.message });
    }
});

app.post('/deploy/stop', authenticate, async (req, res) => {
    const userId = req.user.userId;
    const projectId = userId.toString();

    if (await DeployManager.stopDeployment(projectId)) {
        res.json({ message: "Backend stopped." });
    } else {
        res.status(404).json({ error: "No active backend found" });
    }
});

app.get('/deploy/status', authenticate, (req, res) => {
    const userId = req.user.userId;
    const username = req.user.username;
    const projectId = userId.toString();
    const deployment = DeployManager.getDeployment(projectId);

    res.json({
        frontend: `/sites/${userId}/${username}/index.html`,
        backend: deployment && deployment.status === 'running' ? {
            url: `/deployed/${projectId}`,
            status: "Running",
            port: deployment.port
        } : null
    });
});

app.get('/deploy/logs', authenticate, (req, res) => {
    const userId = req.user.userId;
    const projectId = userId.toString();
    const deployment = DeployManager.getDeployment(projectId);
    if (deployment) {
        res.json({ logs: deployment.logs });
    } else {
        res.json({ logs: [] });
    }
});

// --- HELPER: RECURSIVE SAVE ---
async function saveProjectStructure(node, parentId, userId, currentPath, sharedWith = []) {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return;

    const newFile = new File({ name: node.name, type: node.type, parentId: parentId, content: node.content || "", owner: userId, sharedWith: sharedWith });
    const savedDoc = await newFile.save();
    const fullPath = path.join(currentPath, node.name);

    if (node.type === 'folder') {
        if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
        if (node.children) {
            for (const child of node.children) await saveProjectStructure(child, savedDoc._id, userId, fullPath, sharedWith);
        }
    } else {
        fs.writeFileSync(fullPath, node.content || "");
    }
}

// --- AI ROUTE ---


// --- AUTH & FILE ROUTES ---
app.post('/project/upload', authenticate, async (req, res) => {
    try {
        const { tree } = req.body;
        const userDir = getUserDir(req.user.userId);
        await saveProjectStructure(tree, 'root', req.user.userId, userDir, []);
        res.json({ message: "Uploaded" });
    } catch (err) { res.status(500).json({ error: "Upload failed" }); }
});

// --- AUTH ROUTES CLEANUP: Redundant and broken passport routes removed ---
// Logic moved to top level or replaced by direct API calls at lines 285-450.


// --- GIT ROUTES ---
const simpleGit = require('simple-git');

// Helper component to check git
const git = simpleGit();

app.post('/git/clone', authenticate, async (req, res) => {
    const { repoUrl } = req.body;
    const userId = req.user.userId;

    if (!repoUrl) return res.status(400).json({ error: "Repository URL required" });

    let authRepoUrl = repoUrl;
    try {
        const user = await User.findById(userId);
        if (user && user.githubToken && repoUrl.includes('github.com')) {
            authRepoUrl = repoUrl.replace('https://', `https://${user.githubToken}@`);
        }
    } catch (e) { }

    const repoName = repoUrl.split('/').pop().replace('.git', '');
    const userDir = getUserDir(userId);
    const targetDir = path.join(userDir, repoName);

    if (fs.existsSync(targetDir)) {
        return res.status(400).json({ error: `Folder '${repoName}' already exists.` });
    }

    try {
        console.log(`[Git] Cloning ${repoUrl} to ${targetDir}...`);
        await git.clone(authRepoUrl, targetDir);

        // After clone, scan and import into DB? 
        // For now, we rely on "FileTree" to traverse/discover, 
        // BUT we need to save the structure to MongoDB so 'fetchFiles' sees it?
        // Actually, our current 'fetchFiles' (aka /files endpoint) ONLY returns files from MongoDB.
        // So we MUST Import the file structure into MongoDB File/Folder models.

        // Helper to import fs to db
        const importFsToDb = async (dir, parentId) => {
            const list = fs.readdirSync(dir);
            for (const file of list) {
                if (file === '.git') continue; // Skip .git folder
                const fullPath = path.join(dir, file);
                const stats = fs.statSync(fullPath);

                if (stats.isDirectory()) {
                    const newFolder = new File({
                        name: file,
                        type: 'folder',
                        parentId: parentId,
                        owner: userId,
                        content: ""
                    });
                    const savedFolder = await newFolder.save();
                    await importFsToDb(fullPath, savedFolder._id);
                } else {
                    // It's a file
                    // Read content (limit size?)
                    let content = "";
                    try {
                        if (stats.size < 100000) { // Limit 100kb for now
                            content = fs.readFileSync(fullPath, 'utf8');
                        } else {
                            content = "// File too large to load";
                        }
                    } catch (e) { content = "// Binary or unreadable"; }

                    const newFile = new File({
                        name: file,
                        type: 'file',
                        parentId: parentId,
                        owner: userId,
                        content: content
                    });
                    await newFile.save();
                }
            }
        };

        // Create the Root Folder for the Repo
        const repoRootInfo = new File({
            name: repoName,
            type: 'folder',
            parentId: 'root',
            owner: userId,
            content: ""
        });
        const savedRoot = await repoRootInfo.save();

        await importFsToDb(targetDir, savedRoot._id);

        res.json({ message: "Cloned successfully" });
    } catch (err) {
        console.error("Clone failed:", err);
        res.status(500).json({ error: "Clone failed: " + err.message });
    }
});

// --- NEW GIT ROUTES ---

app.get('/git/status', authenticate, async (req, res) => {
    const { repoName } = req.query;
    const userId = req.user.userId;
    if (!repoName) return res.status(400).json({ error: "Repo name required" });

    const userDir = getUserDir(userId);
    const repoPath = path.join(userDir, repoName);

    if (!fs.existsSync(repoPath)) return res.status(404).json({ error: "Repo not found" });

    try {
        const status = await simpleGit(repoPath).status();
        res.json(status);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/git/add', authenticate, async (req, res) => {
    const { repoName, files } = req.body; // files can be "." or array
    const userId = req.user.userId;

    const userDir = getUserDir(userId);
    const repoPath = path.join(userDir, repoName);

    try {
        await simpleGit(repoPath).add(files || '.');
        res.json({ message: "Added successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/git/commit', authenticate, async (req, res) => {
    const { repoName, message } = req.body;
    const userId = req.user.userId;

    const userDir = getUserDir(userId);
    const repoPath = path.join(userDir, repoName);

    try {
        const user = await User.findById(userId);
        const git = simpleGit(repoPath);

        // Config user if needed (fallback to defaults or user profile)
        const username = user.githubUsername || user.username || "Kevryn User";
        const email = user.email || "user@kevryn.com";

        await git.addConfig('user.name', username);
        await git.addConfig('user.email', email);

        await git.commit(message);
        res.json({ message: "Committed successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/git/push', authenticate, async (req, res) => {
    const { repoName } = req.body;
    const userId = req.user.userId;

    const userDir = getUserDir(userId);
    const repoPath = path.join(userDir, repoName);

    try {
        const user = await User.findById(userId);
        const git = simpleGit(repoPath);

        // We assume 'origin' is set. We need to inject the token into the remote URL if not present.
        // Doing this safely is tricky. Alternative: use the 'onAuth' option or similar if simple-git supports it,
        // OR, just set the remote with token temporarily.
        // Let's try to get the remote, clean it, and re-add with token.

        if (user.githubToken) {
            const remotes = await git.getRemotes(true);
            const origin = remotes.find(r => r.name === 'origin');
            if (origin) {
                let rawUrl = origin.refs.push || origin.refs.fetch;
                // Strip existing auth if any
                rawUrl = rawUrl.replace(/https:\/\/.*@/, 'https://');

                const authUrl = rawUrl.replace('https://', `https://${user.githubToken}@`);
                await git.remote(['set-url', 'origin', authUrl]);
            }
        }

        await git.push();
        res.json({ message: "Pushed successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/git/pull', authenticate, async (req, res) => {
    const { repoName } = req.body;
    const userId = req.user.userId;
    const userDir = getUserDir(userId);
    const repoPath = path.join(userDir, repoName);

    try {
        const user = await User.findById(userId);
        const git = simpleGit(repoPath);

        if (user.githubToken) {
            const remotes = await git.getRemotes(true);
            const origin = remotes.find(r => r.name === 'origin');
            if (origin) {
                let rawUrl = origin.refs.push || origin.refs.fetch;
                rawUrl = rawUrl.replace(/https:\/\/.*@/, 'https://');
                const authUrl = rawUrl.replace('https://', `https://${user.githubToken}@`);
                await git.remote(['set-url', 'origin', authUrl]);
            }
        }

        await git.pull();
        // TODO: Sync changes back to DB (re-import) if pulling introduces new files
        // For now, prompt user to refresh or auto-refresh
        res.json({ message: "Pulled successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/git/repos', authenticate, (req, res) => {
    try {
        const userDir = getUserDir(req.user.userId);

        if (!fs.existsSync(userDir)) return res.json([]);

        const repos = fs.readdirSync(userDir).filter(f => {
            const stat = fs.statSync(path.join(userDir, f));
            return stat.isDirectory() && fs.existsSync(path.join(userDir, f, '.git'));
        });

        res.json({ repos });
    } catch (err) {
        res.status(500).json({ error: "Failed to list repos" });
    }
});

// --- PROJECT TEMPLATES ---
const projectTemplates = {
    'react-vite': [
        { name: 'package.json', content: JSON.stringify({ name: 'my-react-app', version: '0.0.0', scripts: { dev: 'vite' }, dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' }, devDependencies: { vite: '^4.4.5' } }, null, 2) },
        { name: 'index.html', content: '<!DOCTYPE html>\n<html>\n<head>\n  <title>React App</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.jsx"></script>\n</body>\n</html>' },
        { name: 'src/main.jsx', content: "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')).render(<App />);" },
        { name: 'src/App.jsx', content: "import React from 'react';\n\nexport default function App() {\n  return (\n    <div style={{ textAlign: 'center', marginTop: '50px', color: '#61dafb' }}>\n      <h1>Hello from Kevryn IDE!</h1>\n      <p>Your React + Vite project is ready.</p>\n    </div>\n  );\n}" }
    ],
    'express-api': [
        { name: 'package.json', content: JSON.stringify({ name: 'my-api', version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js' }, dependencies: { express: '^4.18.2', cors: '^2.8.5', dotenv: '^16.3.1' } }, null, 2) },
        { name: 'index.js', content: "const express = require('express');\nconst app = express();\nconst port = process.env.PORT || 3000;\n\napp.use(express.json());\n\napp.get('/', (req, res) => {\n  res.json({ message: 'Welcome to your Kevryn-generated API!' });\n});\n\napp.listen(port, () => {\n  console.log(`Server running on port ${port}`);\n});" },
        { name: '.env', content: "PORT=3000" }
    ],
    'static-site': [
        { name: 'index.html', content: '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <link rel="stylesheet" href="style.css">\n  <title>My Portfolio</title>\n</head>\n<body>\n  <div class="container">\n    <h1>Creative Developer</h1>\n    <p>Landing page generated by Kevryn IDE.</p>\n  </div>\n  <script src="script.js"></script>\n</body>\n</html>' },
        { name: 'style.css', content: 'body { background: #0f172a; color: white; font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }\n.container { text-align: center; border: 1px solid #1e293b; padding: 40px; border-radius: 12px; background: rgba(255,255,255,0.02); }' },
        { name: 'script.js', content: 'console.log("Site loaded successfully!");' }
    ],
    'python-script': [
        { name: 'main.py', content: "import os\n\ndef main():\n    print('Hello from your Kevryn Python environment!')\n    print(f'Current Directory: {os.getcwd()}')\n\nif __name__ == '__main__':\n    main()" },
        { name: 'requirements.txt', content: "requests==2.31.0\npytest==7.4.0" }
    ]
};

app.post('/templates/create', authenticate, async (req, res) => {
    const { templateId, folderName, userId } = req.body;
    const templateFiles = projectTemplates[templateId];

    if (!templateFiles) return res.status(404).json({ error: "Template not found" });

    try {
        const userDir = getUserDir(userId);
        const projectRootPath = path.join(userDir, folderName);

        if (fs.existsSync(projectRootPath)) return res.status(400).json({ error: "Folder already exists on disk" });

        fs.mkdirSync(projectRootPath, { recursive: true });

        const dbRootFolder = new File({ name: folderName, type: 'folder', parentId: 'root', owner: userId, content: "" });
        await dbRootFolder.save();

        for (const fileItem of templateFiles) {
            const fullPath = path.join(projectRootPath, fileItem.name);
            const fileDir = path.dirname(fullPath);
            if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
            fs.writeFileSync(fullPath, fileItem.content);

            const pathParts = fileItem.name.split('/');
            if (pathParts.length === 1) {
                const dbFile = new File({ name: fileItem.name, type: 'file', parentId: dbRootFolder._id, owner: userId, content: fileItem.content });
                await dbFile.save();
            } else {
                let currentParentId = dbRootFolder._id;
                for (let i = 0; i < pathParts.length - 1; i++) {
                    const folderNamePart = pathParts[i];
                    let dbFolder = await File.findOne({ name: folderNamePart, parentId: currentParentId, owner: userId });
                    if (!dbFolder) {
                        dbFolder = new File({ name: folderNamePart, type: 'folder', parentId: currentParentId, owner: userId });
                        await dbFolder.save();
                    }
                    currentParentId = dbFolder._id;
                }
                const dbFile = new File({ name: pathParts[pathParts.length - 1], type: 'file', parentId: currentParentId, owner: userId, content: fileItem.content });
                await dbFile.save();
            }
        }
        res.json({ success: true, message: `Template ${templateId} created in ${folderName}` });
    } catch (err) {
        console.error("Template Create Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/search', authenticate, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.json([]);

        const userDir = getUserDir(req.user.userId);
        if (!fs.existsSync(userDir)) return res.json([]);

        const results = [];
        const walk = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    if (file !== '.git' && file !== 'node_modules') walk(fullPath);
                } else {
                    // Only search text files
                    if (file.match(/\.(js|jsx|ts|tsx|html|css|json|py|md|txt|c|cpp|h|java)$/i)) {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const lines = content.split('\n');
                        lines.forEach((line, index) => {
                            if (line.toLowerCase().includes(query.toLowerCase())) {
                                results.push({
                                    file: path.relative(userDir, fullPath).replace(/\\/g, '/'),
                                    line: index + 1,
                                    text: line.trim()
                                });
                            }
                        });
                    }
                }
                if (results.length > 100) break; // Limit results
            }
        };

        walk(userDir);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: "Search failed" });
    }
});

// --- SNIPPET ROUTES ---
app.get('/snippets', authenticate, async (req, res) => {
    try {
        const { search, language } = req.query;
        const query = { userId: req.user.userId };
        if (language) query.language = language;
        let snippets;
        if (search) {
            const regex = new RegExp(search, 'i');
            query.$or = [
                { title: regex },
                { description: regex },
                { tags: regex }
            ];
        }
        snippets = await Snippet.find(query).sort({ updatedAt: -1 });
        res.json(snippets);
    } catch (err) {
        console.error('Snippets fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch snippets' });
    }
});

app.post('/snippets', authenticate, async (req, res) => {
    try {
        const { title, code, language, tags, description } = req.body;
        if (!title || !code) return res.status(400).json({ error: 'Title and code are required' });
        const snippet = new Snippet({
            userId: req.user.userId,
            title,
            code,
            language: language || 'javascript',
            tags: tags || [],
            description: description || ''
        });
        await snippet.save();
        res.status(201).json(snippet);
    } catch (err) {
        console.error('Snippet create error:', err);
        res.status(500).json({ error: 'Failed to create snippet' });
    }
});

app.put('/snippets/:id', authenticate, async (req, res) => {
    try {
        const { title, code, language, tags, description } = req.body;
        const snippet = await Snippet.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.userId },
            { title, code, language, tags, description },
            { new: true }
        );
        if (!snippet) return res.status(404).json({ error: 'Snippet not found' });
        res.json(snippet);
    } catch (err) {
        console.error('Snippet update error:', err);
        res.status(500).json({ error: 'Failed to update snippet' });
    }
});

app.delete('/snippets/:id', authenticate, async (req, res) => {
    try {
        const snippet = await Snippet.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
        if (!snippet) return res.status(404).json({ error: 'Snippet not found' });
        res.json({ message: 'Snippet deleted' });
    } catch (err) {
        console.error('Snippet delete error:', err);
        res.status(500).json({ error: 'Failed to delete snippet' });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Username and password required" });
        const user = await User.findOne({ username });
        
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.password && await bcrypt.compare(password, user.password)) {
            // Include collegeId in JWT for query scoping
            const token = jwt.sign({ userId: user._id, username: user.username, role: user.role, collegeId: user.collegeId || null }, JWT_SECRET, { expiresIn: '1d' });
            // Fetch college name if enrolled
            let collegeName = null;
            if (user.collegeId) {
                const college = await College.findById(user.collegeId);
                if (college) collegeName = college.name;
            }
            res.json({ token, username: user.username, userId: user._id, picture: user.picture, role: user.role, collegeId: user.collegeId || null, collegeName });
        } else {
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/auth/reset-password', async (req, res) => {
    try {
        const { username, email, newPassword } = req.body;
        if (!username || !email || !newPassword) return res.status(400).json({ error: "All fields are required" });

        const user = await User.findOne({ username, email });
        if (!user) return res.status(404).json({ error: "User not found or email doesn't match" });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ success: true, message: "Password updated successfully" });
    } catch (e) {
        res.status(500).json({ error: "Server error" });
    }
});
// --- CREATE FILE (REST) ---
app.post('/files', authenticate, async (req, res) => {
    try {
        const { name, content, courseId } = req.body;
        if (!name) return res.status(400).json({ error: "File name required" });

        // Check if file already exists for this user in this context
        const query = { owner: req.user.userId, name };
        if (courseId) query.courseId = courseId;
        else query.courseId = { $exists: false }; // Or null

        const existing = await File.findOne(query);
        if (existing) return res.status(400).json({ error: "File already exists" });

        const ownerId = mongoose.Types.ObjectId.isValid(req.user.userId) ? new mongoose.Types.ObjectId(req.user.userId) : req.user.userId;
        const newFile = new File({
            name,
            type: 'file',
            content: content || '',
            owner: ownerId,
            sharedWith: [],
            courseId: courseId || undefined
        });
        await newFile.save();

        // Also create on disk
        const userDir = courseId ? getLabDir(req.user.userId, courseId) : getUserDir(req.user.userId);
        const filePath = path.join(userDir, name);
        fs.writeFileSync(filePath, content || '');

        res.status(201).json(newFile);
    } catch (err) {
        console.error("Create file error:", err);
        res.status(500).json({ error: "Failed to create file" });
    }
});
// --- FILE LIST (MOVED TO TOP) ---
app.get('/files/:id', authenticate, async (req, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, $or: [{ owner: req.user.userId }, { sharedWith: req.user.username }] });
        if (!file) return res.status(404).json({ error: "File not found" });
        res.json(file);
    } catch (err) {
        res.status(500).json({ error: "Error fetching file" });
    }
});
app.post('/share', authenticate, async (req, res) => { /* Keep existing */
    try { const { fileId, targetUsername } = req.body; const user = await User.findOne({ username: targetUsername }); if (!user) return res.status(404).json({ error: "User not found" }); await File.findOneAndUpdate({ _id: fileId, owner: req.user.userId }, { $addToSet: { sharedWith: targetUsername } }); res.json({ message: "Shared" }); } catch (err) { res.status(500).json({ error: "Error" }); }
});
app.delete('/files/:id', authenticate, async (req, res) => {
    try {
        // Find the file first to check ownership vs shared status
        const file = await File.findById(req.params.id);
        if (!file) return res.status(404).json({ error: "File not found" });

        if (file.owner.toString() === req.user.userId.toString()) {
            // IF OWNER: Delete from DB and disk
            await File.findByIdAndDelete(req.params.id);
            const userDir = file.courseId ? getLabDir(req.user.userId, file.courseId) : getUserDir(req.user.userId);
            const p = path.join(userDir, file.name);
            if (fs.existsSync(p)) fs.unlinkSync(p);
            return res.json({ message: "Deleted" });
        } else if (file.sharedWith.includes(req.user.username)) {
            // IF COLLABORATOR: Just remove from sharedWith (Unshare)
            await File.findByIdAndUpdate(req.params.id, { $pull: { sharedWith: req.user.username } });
            return res.json({ message: "Unshared" });
        } else {
            return res.status(403).json({ error: "Access denied" });
        }
    } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).json({ error: "Error deleting/unsharing file" });
    }
});
app.put('/files/:id', authenticate, async (req, res) => {
    try {
        const { newName, content } = req.body;
        const updateFields = {};
        if (newName !== undefined) updateFields.name = newName;
        if (content !== undefined) updateFields.content = content;

        // --- TIMELINE: Save snapshot on explicit save if different from last history ---
        if (content !== undefined) {
            const latestHistory = await FileHistory.findOne({ fileId: req.params.id }).sort({ savedAt: -1 });
            if (!latestHistory || latestHistory.content !== content) {
                const history = new FileHistory({
                    fileId: req.params.id,
                    content: content,
                    savedBy: req.user.userId
                });
                await history.save();
                console.log(`[TIMELINE] Snapshot created for file ${req.params.id} by user ${req.user.userId}`);
            } else {
                console.log(`[TIMELINE] Snapshot skipped for file ${req.params.id} (content identical to last history)`);
            }
        }

        const file = await File.findOneAndUpdate(
            {
                _id: req.params.id,
                $or: [
                    { owner: req.user.userId },
                    { sharedWith: req.user.username }
                ]
            },
            updateFields,
            { new: true }
        );
        if (!file) return res.status(404).json({ error: "File not found or access denied" });

        // SYNC TO DISK: Write updated content to user's project directory
        if (content !== undefined) {
            try {
                const userDir = file.courseId ? getLabDir(file.owner || req.user.userId, file.courseId) : getUserDir(file.owner || req.user.userId);
                const filePath = path.join(userDir, file.name);
                fs.writeFileSync(filePath, content);
                console.log(`[FILE SYNC] Synced ${file.name} to disk at ${filePath}`);
            } catch (diskErr) {
                console.error(`[FILE SYNC] Disk write failed for ${file.name}:`, diskErr.message);
            }
        }

        res.json(file);
    } catch (err) { res.status(500).json({ error: "Error updating file" }); }
});

app.get('/files/:id/timeline', authenticate, async (req, res) => {
    try {
        // Enforce same permissions as getting the file
        const file = await File.findOne({
            _id: req.params.id,
            $or: [
                { owner: req.user.userId },
                { sharedWith: req.user.username }
            ]
        });
        if (!file) {
            console.warn(`[TIMELINE ERROR] Fetch denied for file ${req.params.id} (User: ${req.user.userId})`);
            return res.status(404).json({ error: "File not found or access denied" });
        }

        const history = await FileHistory.find({ fileId: req.params.id })
            .populate('savedBy', 'username')
            .populate('fileId', 'name')
            .sort({ savedAt: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch timeline" });
    }
});

// --- REST CODE EXECUTION ENDPOINT (Fallback when node-pty unavailable in Railway) ---
app.post('/run-code', authenticate, async (req, res) => {
    const { code, language, fileName } = req.body;
    if (!code || !language) return res.status(400).json({ error: 'Code and language are required' });

    const tmpDir = path.join(os.tmpdir(), `kevryn_exec_${req.user.userId}_${Date.now()}`);
    try {
        fs.mkdirSync(tmpDir, { recursive: true });
    } catch (e) { }

    let cmd, srcFile;
    try {
        switch (language.toLowerCase()) {
            case 'python':
            case 'python3': {
                srcFile = path.join(tmpDir, fileName || 'main.py');
                fs.writeFileSync(srcFile, code);
                cmd = `python3 "${srcFile}"`;
                break;
            }
            case 'c': {
                srcFile = path.join(tmpDir, fileName || 'main.c');
                const outFile = path.join(tmpDir, 'a.out');
                fs.writeFileSync(srcFile, code);
                cmd = `gcc "${srcFile}" -o "${outFile}" && "${outFile}"`;
                break;
            }
            case 'cpp':
            case 'c++': {
                srcFile = path.join(tmpDir, fileName || 'main.cpp');
                const outFileCpp = path.join(tmpDir, 'a.out');
                fs.writeFileSync(srcFile, code);
                cmd = `g++ "${srcFile}" -o "${outFileCpp}" && "${outFileCpp}"`;
                break;
            }
            case 'java': {
                // Extract class name
                const classMatch = code.match(/public\s+class\s+(\w+)/);
                const className = classMatch ? classMatch[1] : 'Main';
                srcFile = path.join(tmpDir, `${className}.java`);
                fs.writeFileSync(srcFile, code);
                cmd = `javac "${srcFile}" -d "${tmpDir}" && java -cp "${tmpDir}" ${className}`;
                break;
            }
            case 'javascript':
            case 'node': {
                srcFile = path.join(tmpDir, fileName || 'main.js');
                fs.writeFileSync(srcFile, code);
                cmd = `node "${srcFile}"`;
                break;
            }
            default:
                return res.status(400).json({ error: `Language '${language}' not supported for direct execution.` });
        }

        const { stdout, stderr } = await execAsync(cmd, { timeout: 15000, cwd: tmpDir });
        res.json({ output: stdout + (stderr ? `\nSTDERR: ${stderr}` : ''), error: null });
    } catch (e) {
        const errOutput = (e.stdout || '') + (e.stderr || '') || e.message;
        res.json({ output: null, error: errOutput });
    } finally {
        // Cleanup temp dir
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { }
    }
});

// Removed to move higher up
app.get('/api/debug-env', authenticate, async (req, res) => {
    const results = {};
    const checks = [
        { name: 'python3', cmd: 'python3 --version' },
        { name: 'python', cmd: 'python --version' },
        { name: 'gcc', cmd: 'gcc --version' },
        { name: 'g++', cmd: 'g++ --version' },
        { name: 'node', cmd: 'node --version' }
    ];

    for (const check of checks) {
        try {
            const { stdout } = await execAsync(check.cmd);
            results[check.name] = stdout.trim().split('\n')[0];
        } catch (e) {
            results[check.name] = 'Not Found';
        }
    }
    res.json({ environment: results, platform: os.platform(), path: process.env.PATH });
});

app.post('/files/history/:historyId/restore', authenticate, async (req, res) => {
    try {
        const historyRecord = await FileHistory.findById(req.params.historyId);
        if (!historyRecord) return res.status(404).json({ error: "History record not found" });

        const file = await File.findOne({
            _id: historyRecord.fileId,
            $or: [{ owner: req.user.userId }, { sharedWith: req.user.username }]
        });
        if (!file) return res.status(404).json({ error: "File not found or access denied" });

        // Save current content to history before restoring (so you can "undo" the restore)
        const currentSnapshot = new FileHistory({
            fileId: file._id,
            content: file.content,
            savedBy: req.user.userId
        });
        await currentSnapshot.save();

        // Update file content
        file.content = historyRecord.content;
        await file.save();

        res.json({ success: true, message: "File restored", content: file.content });
    } catch (err) {
        res.status(500).json({ error: "Failed to restore file" });
    }
});
app.post('/project/sync', authenticate, async (req, res) => { /* Keep existing */
    const { targetUsername } = req.body; try { const targetUser = await User.findOne({ username: targetUsername }); if (!targetUser) return res.status(404).json({ error: "User not found" }); await User.findByIdAndUpdate(req.user.userId, { $addToSet: { collaborators: targetUsername } }); await File.updateMany({ owner: req.user.userId }, { $addToSet: { sharedWith: targetUsername } }); res.json({ message: "Synced!" }); } catch (err) { res.status(500).json({ error: "Sync failed" }); }
});

// --- SOCKET INITIALIZATION moved to top ---

io.on('connection', (socket) => {
    socket.on('register-user', (u) => socket.join(u));
    socket.on('join-file', async (fid) => { socket.join(fid); const f = await File.findById(fid); if (f) socket.emit('receive-code', f.content); });
    const lastTimelineSnapshots = {}; // { fileId: timestamp }

    socket.on('code-change', async ({ fileId, newCode, userId }) => {
        try {
            // 1. Broadcast to others immediately for low latency
            socket.to(fileId).emit('receive-code', newCode);

            // 2. Throttle DB updates - Only update DB if last update was > 1s ago or on final change
            // Using a simple debounce/throttle logic here
            const now = Date.now();
            const lastUpdate = lastTimelineSnapshots[fileId + '_db'] || 0;

            if (now - lastUpdate > 1000) { // 1 second throttling for DB persistence
                lastTimelineSnapshots[fileId + '_db'] = now;
                await File.findByIdAndUpdate(fileId, { content: newCode });
            }

            // --- THROTTLED TIMELINE: Save history snapshot every 5 minutes of active typing ---
            const lastSnap = lastTimelineSnapshots[fileId] || 0;
            if (now - lastSnap > 300000) { // 5 minutes
                lastTimelineSnapshots[fileId] = now;
                const history = new FileHistory({
                    fileId,
                    content: newCode,
                    savedBy: userId
                });
                await history.save();
                console.log(`[TIMELINE] Auto-snapshot for ${fileId}`);
            }
        } catch (e) {
            console.error(`[SYNC ERROR] Failed to update file ${fileId}:`, e);
        }
    });
    socket.on('join-chat', async () => { const m = await Message.find().limit(50); socket.emit('previous-messages', m); });

    // --- VAYU LAB MONITOR: API ROUTES ---
    // (Moved to top level)

    // --- VAYU LAB MONITOR: Socket Events ---

    // Track faculty socket â†’ sessionId mapping for disconnect handling
    let facultySessionId = null;

    // Faculty joins a session room to receive student updates
    socket.on('faculty-join', async ({ sessionId }) => {
        facultySessionId = sessionId; // Track which session this faculty is monitoring
        if (sessionId) {
            socket.join(`lab-${sessionId}`);
            console.log(`[LAB] Faculty socket ${socket.id} joined room lab-${sessionId}`);

            try {
                // Fetch session for whitelisted students
                const session = await LabSession.findById(sessionId);
                const allowedStudents = session ? session.allowedStudents : [];

                // Send immediate state snapshot
                const activeStudents = liveLabState[sessionId] ? Object.values(liveLabState[sessionId]) : [];

                socket.emit('lab-initial-state', {
                    activeStudents,
                    allowedStudents
                });
            } catch (e) {
                console.error("[LAB] Failed to fetch session for initial state", e);
                socket.emit('lab-initial-state', {
                    activeStudents: liveLabState[sessionId] ? Object.values(liveLabState[sessionId]) : [],
                    allowedStudents: []
                });
            }
        }
    });

    // Student joins a session room and notifies faculty
    socket.on('student-join-lab', async ({ sessionId, username, userId, initialData }) => {
        if (sessionId && username) {
            socket.join(`lab-${sessionId}`);
            console.log(`[DIAGNOSTIC] STUDENT JOIN LAB: ${username} (Socket: ${socket.id}) for session ${sessionId}`);

            // Track socket for disconnect handler
            socketToUser[socket.id] = { sessionId, username };

            // Initialize or update state
            if (!liveLabState[sessionId]) liveLabState[sessionId] = {};

            const state = {
                username,
                status: 'active',
                explicitlyLeft: false, // RESET LOCKDOWN
                lastActive: new Date().toLocaleTimeString(),
                code: initialData?.code || '',
                activeFile: initialData?.activeFile || null,
                language: initialData?.language || 'javascript',
                tabSwitchCount: liveLabState[sessionId][username]?.tabSwitchCount || 0,
                pasteCount: liveLabState[sessionId][username]?.pasteCount || 0,
                attentionScore: liveLabState[sessionId][username]?.attentionScore || 100
            };

            liveLabState[sessionId][username] = { ...liveLabState[sessionId][username], ...state };

            // PERSIST TO DB: Ensure student is marked as active in DB
            try {
                await LabSession.updateOne(
                    { _id: sessionId, "activeStudents.username": username },
                    { $set: { "activeStudents.$.currentStatus": 'active', "activeStudents.$.lastHeartbeat": new Date() } }
                );
            } catch (err) {
                console.error(`[LAB DB ERROR] Failed to update join status for ${username}:`, err);
            }

            // CLEAR OFFLINE TIMEOUT: If they reconnected during grace
            if (offlineTimeouts[username]) {
                console.log(`[LAB] ${username} reconnected. Cancelling offline timeout.`);
                clearTimeout(offlineTimeouts[username]);
                delete offlineTimeouts[username];
            }

            // Notify faculty
            io.to(`lab-${sessionId}`).emit('student-data-update', liveLabState[sessionId][username]);

            // NEW: Send current state back to student (to resume counts after refresh)
            socket.emit('lab-student-sync', liveLabState[sessionId][username]);
        }
    });

    // Student sends code updates â†’ broadcast to faculty
    socket.on('student-code-update', ({ sessionId, username, fileName, code, language }) => {
        // console.log(`[LAB] Code update from ${username} | session: ${sessionId} | len: ${(code || '').length}`);
        if (sessionId && username) {
            // Update state
            if (!liveLabState[sessionId]) liveLabState[sessionId] = {};

            // Guard: Only allow updates if the student is supposedly active or idle
            const studentState = liveLabState[sessionId][username] || {};
            if (studentState.status === 'offline' || studentState.explicitlyLeft) {
                // console.log(`[LAB] Ignoring code update from offline/left student ${username}`);
                return;
            }

            liveLabState[sessionId][username] = {
                ...studentState,
                username,
                status: studentState.status || 'active',
                lastActive: new Date().toLocaleTimeString(),
                code: code || '',
                activeFile: fileName || 'untitled',
                language: language || 'javascript'
            };

            io.to(`lab-${sessionId}`).emit('student-data-update', liveLabState[sessionId][username]);

        }
    });

    // NEW: Real-time status update (Immediate feedback for Active/Idle)
    socket.on('student-status-update', async ({ sessionId, username, status }) => {
        if (sessionId && username && status) {
            if (!liveLabState[sessionId]) liveLabState[sessionId] = {};
            const studentState = liveLabState[sessionId][username] || {};

            // LOCKDOWN: If student explicitly left, do NOT revive
            if (studentState.explicitlyLeft) return;

            liveLabState[sessionId][username] = {
                ...studentState,
                username,
                status: status,
                lastActive: new Date().toLocaleTimeString()
            };

            console.log(`[LAB] Status Update: ${username} is now ${status}`);
            io.to(`lab-${sessionId}`).emit('student-data-update', liveLabState[sessionId][username]);

            // PERSIST TO DB: Update status in MongoDB activeStudents array
            try {
                await LabSession.updateOne(
                    { _id: sessionId, "activeStudents.username": username },
                    { $set: { "activeStudents.$.currentStatus": status } }
                );
            } catch (err) {
                console.error(`[LAB DB ERROR] Failed to persist status for ${username}:`, err);
            }
        }
    });

    // Tab Switch Event (Consolidated & Persisted)
    socket.on('student-tab-switch', async ({ sessionId, username, direction, count }) => {
        if (sessionId && username) {
            if (!liveLabState[sessionId]) liveLabState[sessionId] = {};
            const studentState = liveLabState[sessionId][username] || {};

            // LOCKDOWN: If student explicitly left, do NOT revive or track
            if (studentState.explicitlyLeft) return;

            if (!liveLabState[sessionId][username]) liveLabState[sessionId][username] = {};

            const switchCount = count || (liveLabState[sessionId][username].tabSwitchCount || 0) + 1;
            liveLabState[sessionId][username].tabSwitchCount = switchCount;

            // Update status to 'distracted' if they left the tab
            if (liveLabState[sessionId][username].status !== 'offline') {
                liveLabState[sessionId][username].status = direction === 'left' ? 'distracted' : 'active';
            }

            // Recompute attention score
            const tabPenalty = Math.min(switchCount * 5, 40);
            const pastePenalty = Math.min((liveLabState[sessionId][username].pasteCount || 0) * 8, 30);
            liveLabState[sessionId][username].attentionScore = Math.max(0, 100 - tabPenalty - pastePenalty);

            io.to(`lab-${sessionId}`).emit('student-data-update', {
                ...liveLabState[sessionId][username],
                lastActive: new Date().toLocaleTimeString()
            });

            // PERSIST TO DB: Update counts and status
            try {
                await LabSession.updateOne(
                    { _id: sessionId, "activeStudents.username": username },
                    {
                        $set: {
                            "activeStudents.$.tabSwitchCount": switchCount,
                            "activeStudents.$.currentStatus": liveLabState[sessionId][username].status,
                            "activeStudents.$.attentionScore": liveLabState[sessionId][username].attentionScore
                        },
                        $push: {
                            activityLog: {
                                username,
                                event: 'tab-switch',
                                details: `Tab Switched (#${switchCount}) - Direction: ${direction}`,
                                timestamp: new Date()
                            }
                        }
                    }
                );
            } catch (err) {
                console.error(`[LAB DB ERROR] Tab switch persistence failed:`, err);
            }
        }
    });

    // Paste Event (Consolidated & Persisted)
    socket.on('student-paste', async ({ sessionId, username, charCount, count }) => {
        if (sessionId && username) {
            if (!liveLabState[sessionId]) liveLabState[sessionId] = {};
            const studentState = liveLabState[sessionId][username] || {};

            // LOCKDOWN: If student explicitly left, do NOT revive or track
            if (studentState.explicitlyLeft) return;

            if (!liveLabState[sessionId][username]) liveLabState[sessionId][username] = {};

            const pasteCount = count || (liveLabState[sessionId][username].pasteCount || 0) + 1;
            liveLabState[sessionId][username].pasteCount = pasteCount;

            // Recompute attention score
            const tabPenalty = Math.min((liveLabState[sessionId][username].tabSwitchCount || 0) * 5, 40);
            const pastePenalty = Math.min(pasteCount * 8, 30);
            liveLabState[sessionId][username].attentionScore = Math.max(0, 100 - tabPenalty - pastePenalty);

            io.to(`lab-${sessionId}`).emit('student-data-update', {
                ...liveLabState[sessionId][username],
                suspicious: (charCount || 0) > 80,
                lastActive: new Date().toLocaleTimeString()
            });

            // PERSIST TO DB: Update paste count and attention score
            try {
                await LabSession.updateOne(
                    { _id: sessionId, "activeStudents.username": username },
                    {
                        $set: {
                            "activeStudents.$.pasteCount": pasteCount,
                            "activeStudents.$.attentionScore": liveLabState[sessionId][username].attentionScore
                        },
                        $push: {
                            activityLog: {
                                username,
                                event: 'paste-detected',
                                details: `${charCount || 0} chars pasted (Total #${pasteCount})`,
                                timestamp: new Date()
                            }
                        }
                    }
                );
            } catch (err) {
                console.error(`[LAB DB ERROR] Paste persistence failed:`, err);
            }
        }
    });

    // Student explicitly leaves (Logout button)
    socket.on('student-leave-lab', async ({ sessionId, username, userId }) => {
        if (liveLabState[sessionId] && liveLabState[sessionId][username]) {
            liveLabState[sessionId][username].status = 'offline';
            liveLabState[sessionId][username].explicitlyLeft = true; // LOCKDOWN: Cannot be revived except by student-join-lab
            liveLabState[sessionId][username].lastActive = new Date().toLocaleTimeString();

            // Notify faculty
            io.to(`lab-${sessionId}`).emit('student-data-update', {
                username,
                status: 'offline',
                lastActive: new Date().toLocaleTimeString()
            });

            // PERSIST TO DB
            try {
                await LabSession.updateOne(
                    { _id: sessionId, "activeStudents.username": username },
                    { $set: { "activeStudents.$.currentStatus": 'offline' } }
                );
            } catch (err) { }

            // FIX: Clear the sessionId from this socket to prevent revival by other events
            if (socketToUser[socket.id]) {
                console.log(`[LAB] Clearing session ${sessionId} for socket ${socket.id}`);
                delete socketToUser[socket.id];
            }
            // FIX: Leave the socket room so no more updates are received/interfered
            socket.leave(`lab-${sessionId}`);
        }
    });

    // FIX: CREATE NODE ERROR - Now supports recursive folder creation and callbacks
    socket.on('create-node', async ({ parentId, newNode, userId, courseId }, callback) => {
        if (!userId) {
            console.error("âŒ create-node failed: No User ID");
            if (callback) callback({ error: "No User ID" });
            return;
        }

        let collaborators = [];
        try {
            const user = await User.findById(userId);
            if (user) collaborators = user.collaborators;
        } catch (e) { }

        const content = newNode.content || "";
        const name = newNode.name;

        try {
            // FIX: Explicitly cast userId to ObjectId to ensure indexed owner search works
            const ownerId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

            // Check if name already includes path (e.g. from template or bulk sync)
            // FIX: persist courseId so lab files are filterable by /files?courseId=...
            const f = new File({
                name,
                type: newNode.type,
                parentId: parentId || 'root',
                owner: ownerId,
                content: content,
                sharedWith: collaborators,
                courseId: courseId || undefined
            });

            await f.save();

            // Determine actual disk path based on hierarchy
            const relativePath = await getFileRelativePath(f._id);
            const nodeUserDir = courseId ? getLabDir(userId, courseId) : getUserDir(userId);
            const fullPathOnDisk = path.join(nodeUserDir, relativePath);

            if (newNode.type === 'file') {
                const dir = path.dirname(fullPathOnDisk);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                console.log(`[FILE] Creating new file on disk: ${fullPathOnDisk}`);
                fs.writeFileSync(fullPathOnDisk, content);
            } else if (newNode.type === 'folder') {
                if (!fs.existsSync(fullPathOnDisk)) fs.mkdirSync(fullPathOnDisk, { recursive: true });
            }


            io.emit('node-created');
            if (collaborators.length > 0) {
                collaborators.forEach(collab => { socket.to(collab).emit('file-shared', name); });
            }

            if (callback) callback({ success: true, fileId: f._id });
        } catch (err) {
            console.error("âŒ create-node error:", err);
            if (callback) callback({ error: err.message });
        }
    });

    // --- FILE OPERATIONS ---
    socket.on('save-file-disk', async ({ fileName, code, userId, fileId, courseId }, callback) => {
        try {
            if (!userId) return console.error("[FILE ERROR] No userId provided for save");

            let filePathOnDisk;
            const nodeUserDir = courseId ? getLabDir(userId, courseId) : getUserDir(userId);

            if (fileId) {
                const relativePath = await getFileRelativePath(fileId);
                filePathOnDisk = path.join(nodeUserDir, relativePath);
            } else {
                // Fallback for older clients or generic saves
                const safeName = fileName.replace(/\.\./g, '');
                filePathOnDisk = path.join(nodeUserDir, safeName);
            }

            const dir = path.dirname(filePathOnDisk);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            console.log(`[SAVE] Writing to disk: ${filePathOnDisk} | Content Length: ${code?.length || 0}`);
            fs.writeFileSync(filePathOnDisk, code || "");
            console.log(`[FILE SUCCESS] Saved at ${filePathOnDisk}`);

            socket.emit('save-complete', fileName || fileId);
            if (callback) callback({ success: true });
        } catch (err) {
            console.error(`[FILE ERROR] Error saving file:`, err);
            if (callback) callback({ error: err.message });
        }
    });


    // --- CURSOR SHARING ---
    socket.on('cursor-move', ({ fileId, userId, username, position }) => {
        // Broadcast to everyone ELSE in the room
        socket.to(fileId).emit('cursor-update', { userId, username, position });
    });

    // --- TERMINAL HANDLING ---
    const terminals = {}; // Store active terminals for this socket

    socket.on('terminal:create', ({ termId, userId }) => {
        console.log(`[TERMINAL] Request to create terminal ${termId} for user ${userId}`);

        // CHECK: Debounce creation to prevent rapid crash loops
        if (terminals[termId] && terminals[termId].lastCreation && (Date.now() - terminals[termId].lastCreation < 2000)) {
            console.warn(`[TERMINAL] Ignoring rapid recreate request for ${termId}`);
            return;
        }

        // KILL existing PTY if it exists for this termId to prevent duplicates
        if (terminals[termId]) {
            console.log(`[TERMINAL] Killing existing terminal ${termId} before recreation`);
            try { terminals[termId].kill(); } catch (e) { }
            delete terminals[termId];
        }

        // GUARD: Ensure PTY is available
        if (!pty) {
            console.error(`[TERMINAL] Cannot create terminal: node-pty not loaded.`);
            socket.emit('terminal:data', {
                termId,
                data: '\r\n\x1b[31mError: Terminal engine (node-pty) could not be loaded on this environment.\x1b[0m\r\n\x1b[33mDirect execution (Run Code) may still work.\x1b[0m\r\n'
            });
            return;
        }

        // FIX: Use cmd.exe for better stability on this environment
        const shell = os.platform() === 'win32' ? 'cmd.exe' : 'bash';

        let { courseId } = socket.handshake.query || {};
        console.log(`[TERMINAL] CourseId check: '${courseId}' (${typeof courseId})`);

        // FIX: Sanitize courseId
        if (courseId === 'undefined' || courseId === 'null' || courseId === '' || courseId === 'NaN') {
            console.log(`[TERMINAL] Sanitizing invalid courseId: ${courseId}`);
            courseId = undefined;
        }

        // FIX: Always start in the user's specific project directory
        // Ensure baseUserDir is defined or handled. It seems missing in this scope based on snippets.
        // Assuming getUserDir uses a global base or internal logic.
        let termCwd;
        if (userId) {
            termCwd = courseId ? getLabDir(userId, courseId) : getUserDir(userId);
        } else {
            // Fallback
            termCwd = path.join(__dirname, 'user_projects');
        }

        try {
            // Check if CWD exists to prevent immediate crash
            if (!fs.existsSync(termCwd)) {
                console.warn(`[TERMINAL WARN] CWD does not exist: ${termCwd}. Attempting to create it.`);
                fs.mkdirSync(termCwd, { recursive: true });
            }

            const ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-color',
                cols: 80,
                rows: 30,
                cwd: termCwd,
                env: {
                    ...process.env,
                    TERM: 'xterm-256color',
                    // Step 3: Explicitly inject system paths to ensure tools are found
                    PATH: (process.env.PATH || '') + (os.platform() === 'win32' ? ';' : ':') + '/usr/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/bin:/sbin'
                },
                handleFlowControl: true
            });

            console.log(`[TERMINAL] Created terminal ${termId} (PID: ${ptyProcess.pid}) at ${termCwd}`);
            terminals[termId] = ptyProcess;
            terminals[termId].lastCreation = Date.now();

            const handleData = (data) => {
                socket.emit('terminal:data', { termId, data });
            };
            ptyProcess.on('data', handleData);

            ptyProcess.on('exit', (code) => {
                console.log(`[TERMINAL] Terminal ${termId} exited with code ${code}`);
                socket.emit('terminal:data', { termId, data: '\r\nTerminal Exited\r\n' });
                // Clean up listener when PTY exits
                ptyProcess.removeListener('data', handleData);
            });
        } catch (err) {
            console.error(`[TERMINAL] Failed to spawn terminal:`, err);
            socket.emit('terminal:data', { termId, data: `\r\nError: Failed to spawn terminal: ${err.message}\r\n` });
        }
    });

    socket.on('terminal:write', ({ termId, data }) => {
        if (terminals[termId]) {
            terminals[termId].write(data);
        }
    });

    // --- TERMINAL MIRRORING (WebContainer Support) ---
    socket.on('terminal:mirror', ({ termId, data }) => {
        if (socketToUser[socket.id]) {
            const { sessionId } = socketToUser[socket.id];
            // Broadcast to faculty monitoring this session
            io.to(`lab-${sessionId}`).emit('terminal:data', { termId, data });
        }
    });

    socket.on('terminal:close', ({ termId }) => {
        if (terminals[termId]) {
            terminals[termId].kill();
            delete terminals[termId];
        }
    });

    socket.on('disconnect', async () => {
        console.log(`[DIAGNOSTIC] Socket ${socket.id} disconnected. facultySessionId=${facultySessionId}, isStudent=${!!socketToUser[socket.id]}`);

        // Kill all terminals for this socket
        Object.keys(terminals).forEach(id => {
            if (terminals[id]) terminals[id].kill();
        });

        // FIXED: Don't auto-end session on faculty disconnect to support reloads.
        // Sessions only end via explicit 'End Session' button or timer.
        if (facultySessionId) {
            console.log(`[LAB] Faculty socket ${socket.id} disconnected from session ${facultySessionId} (Session remains active)`);
            facultySessionId = null;
        }

        // Clean up student tracking
        if (socketToUser[socket.id]) {
            const { sessionId, username } = socketToUser[socket.id];

            // CHECK: Is there any other socket still connected for this user?
            const otherSocket = Object.entries(socketToUser).find(([sid, u]) =>
                sid !== socket.id && u.username === username && u.sessionId === sessionId
            );

            if (otherSocket) {
                console.log(`[LAB] Student ${username} still has other active sockets. Skipping offline grace period.`);
                delete socketToUser[socket.id];
                return;
            }

            // GRACE PERIOD: Don't set offline immediately (Railway 502/Refreshes)
            console.log(`[LAB] Student ${username} last socket disconnected. Starting 15s offline grace period...`);

            // Clear any existing timeout for this user
            if (offlineTimeouts[username]) clearTimeout(offlineTimeouts[username]);

            offlineTimeouts[username] = setTimeout(async () => {
                if (liveLabState[sessionId] && liveLabState[sessionId][username]) {
                    liveLabState[sessionId][username].status = 'offline';
                    liveLabState[sessionId][username].lastActive = new Date().toLocaleTimeString();
                    // Notify faculty
                    io.to(`lab-${sessionId}`).emit('student-data-update', {
                        username,
                        status: 'offline',
                        lastActive: new Date().toLocaleTimeString()
                    });
                    console.log(`[LAB] Grace period ended. ${username} is now OFFLINE.`);

                    // PERSIST TO DB: Save offline status to database after grace period
                    try {
                        await LabSession.updateOne(
                            { _id: sessionId, "activeStudents.username": username },
                            { $set: { "activeStudents.$.currentStatus": 'offline' } }
                        );
                        console.log(`[LAB DB] Persisted OFFLINE status for ${username} after disconnect.`);
                    } catch (err) {
                        console.error(`[LAB DB ERROR] Failed to persist disconnect offline status for ${username}:`, err);
                    }
                }
                delete offlineTimeouts[username];
            }, 15000); // 15 seconds grace

            delete socketToUser[socket.id];
        }
    });

    // LEGACY REDUNDANT HANDLERS REMOVED (Consolidated above)
});

// --- LAST RESORT 404 HANDLER (For Debugging) ---
app.use((req, res) => {
    console.log(`[404] Unhandled request: ${req.method} ${req.url}`);
    res.status(404).json({
        error: "Route not found",
        path: req.path,
        method: req.method,
        suggestion: "Check if the API route is correctly registered in index.js"
    });
});

// --- MOVED API ROUTES ---
app.get('/lab/session-activity-log/:sessionId', authenticate, async (req, res) => {
    try {
        const session = await LabSession.findById(req.params.sessionId).select('activityLog');
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session.activityLog);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// FINAL BOOT: MOVED TO TOP OF DB CONNECTION BLOCK
// ============================================================


process.on('SIGTERM', () => {
    console.log('[SHUTDOWN] SIGTERM received.');
    if (server) server.close(() => process.exit(0));
    else process.exit(0);
});
