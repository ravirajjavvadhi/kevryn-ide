console.log('[DEBUG] --- START OF INDEX.JS ---');
const initialPort = process.env.PORT;
require('dotenv').config();
const finalPort = process.env.PORT;

if (initialPort && finalPort && initialPort !== finalPort) {
    console.warn(`[PORT] WARNING: Environment PORT (${initialPort}) was overridden by .env PORT (${finalPort}). This may break Railway connectivity.`);
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

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
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const session = require('express-session');

// --- ENV VARS ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:5000/auth/github/callback';
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'kevryn_session_secret';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
// Railway Fix: Prefer initialPort (from environment) over potential .env overrides
const PORT = initialPort || process.env.PORT || 5000;

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
const DeployManager = require('./deploy/DeployManager');
const { createProxyMiddleware } = require('http-proxy-middleware');
const courseManager = require('./routes/courseManager');
const assignmentManager = require('./routes/assignmentManager');

const app = express();
app.set('trust proxy', 1);

// --- GLOBAL STATE ---
let io;
const liveLabState = {};
const socketToUser = {};

// --- LISTEN EARLY (Railway 502 Fix) ---
const server = http.createServer(app);

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

const HOST = '0.0.0.0';
// We will call server.listen at the very end of the file to ensure all middleware is registered first.


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

// --- CORS & SECURITY MIDDLEWARE ---
// EARLY-STAGE CORS: Setup headers before ANY other middleware to fix Express 5 preflight issues
app.use((req, res, next) => {
    const origin = req.headers.origin;
    // Echo back the request origin if it's on our allowed list or if we're in production mode
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24h

    if (req.method === 'OPTIONS') {
        res.setHeader('Content-Length', '0');
        return res.status(204).end();
    }
    next();
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());

// Keep the standard CORS middleware as a fallback/secondary layer
const allowedOrigins = [
    'https://kevryn-ide.netlify.app',
    'http://localhost:3000',
    'http://localhost:3001'
];
const corsOptions = {
    origin: (origin, callback) => callback(null, origin || true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));


// --- WEBCONTAINER SECURITY HEADERS (only for non-API routes) ---
app.use((req, res, next) => {
    // Only set COOP/COEP for the root/app pages, NOT API routes
    // These headers break cross-origin API calls when set globally
    if (!req.path.startsWith('/auth') && !req.path.startsWith('/api') && !req.path.startsWith('/files') && !req.path.startsWith('/run-code')) {
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- SESSION & PASSPORT MIDDLEWARE ---
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true, // Required for HTTPS
        sameSite: 'none' // Required for cross-site (Vercel to Railway)
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport Serialization
passport.serializeUser((user, done) => {
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (e) {
        done(e, null);
    }
});

// GitHub Strategy
passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: GITHUB_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ githubId: profile.id });
        if (!user) {
            user = new User({
                username: profile.username || `github_user_${profile.id}`,
                githubId: profile.id,
                githubUsername: profile.username,
                githubToken: accessToken,
                picture: profile.photos && profile.photos[0] ? profile.photos[0].value : "",
                role: 'student'
            });
            await user.save();
        }
        return done(null, user);
    } catch (e) {
        return done(e, null);
    }
}));

// --- AUTH MIDDLEWARE ---
const { authenticate } = require('./utils/authMiddleware');

// --- AUTH ROUTES ---
app.post('/auth/register', async (req, res) => {
    try {
        const { username, password, email, role } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Username and password required" });

        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: "Username taken" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            username,
            password: hashedPassword,
            email,
            role: role || 'student'
        });
        await user.save();

        const token = jwt.sign({ userId: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user: { _id: user._id, username: user.username, role: user.role, picture: user.picture } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: username });
        if (!user) return res.status(400).json({ error: "User not found" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: "Invalid credentials" });

        // ADMIN OVERRIDE: ravirajjavvadi force admin
        if (user.username === 'ravirajjavvadi') {
            user.role = 'admin';
        }

        const token = jwt.sign({ userId: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user: { _id: user._id, username: user.username, role: user.role, picture: user.picture } });
    } catch (e) {
        console.error("Login Error:", e);
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

// --- OAUTH ROUTES ---

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
                username: email.split('@')[0], // Use part of email as username
                email,
                googleId: sub,
                picture,
                role: 'student'
            });
            await user.save();
        }

        // ADMIN OVERRIDE: prsnlkalyan@gmail.com force admin + name change
        if (user.email === 'prsnlkalyan@gmail.com') {
            user.role = 'admin';
            user.username = 'P KALYAN REDDY';
        }

        const jwtToken = jwt.sign(
            { userId: user._id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token: jwtToken, username: user.username, userId: user._id, picture: user.picture, role: user.role });
    } catch (e) {
        console.error("Google Auth Error:", e);
        res.status(500).json({ error: "Google Authentication Failed" });
    }
});

// GitHub Login
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

app.get('/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/login' }),
    (req, res) => {
        // Successful authentication
        const user = req.user;
        const token = jwt.sign(
            { userId: user._id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Redirect to client with token (simple approach) or use a success page
        // For local dev, we can redirect to client URL with query param
        res.redirect(`${CLIENT_URL}?token=${token}&username=${user.username}&userId=${user._id}&role=${user.role}&picture=${encodeURIComponent(user.picture)}`);
    }
);

// 1. Create Session (Faculty Only)
app.post('/lab/create-session', async (req, res) => {
    try {
        const { facultyId, sessionName, subject, semester, allowedStudents, courseId, batchId, duration } = req.body;


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
        // Find the most recent active session for this faculty
        const session = await LabSession.findOne({
            facultyId: req.user.userId,
            isActive: true
        }).sort({ startTime: -1 });

        console.log(`[DIAGNOSTIC] FETCH ACTIVE SESSION for ${req.user.userId}: ${session ? session._id : 'none'}`);
        res.json({ session });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 1.5.1 Get Active Session (Student Check)
app.get('/lab/student/active-session', authenticate, async (req, res) => {
    try {
        // Find an active session where this student is whitelisted
        const session = await LabSession.findOne({
            isActive: true,
            allowedStudents: req.user.username
        }).sort({ startTime: -1 });

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

// 1.8 Get Course Reports (Faculty View)
app.get('/lab/reports/:courseId', authenticate, async (req, res) => {
    try {
        const courseId = req.params.courseId;

        // 1. Get the Course to find Batches
        const course = await Course.findById(courseId);

        let enrolledStudents = [];

        if (course) {
            // 2. Get Batches for this course
            const batches = await Batch.find({ courseId: course._id });
            // 3. Extract all students
            batches.forEach(b => {
                b.students.forEach(s => {
                    // Avoid duplicates
                    if (!enrolledStudents.find(e => e.username === s.username)) {
                        enrolledStudents.push({
                            username: s.username,
                            email: s.email,
                            picture: null // We might need to fetch User model to get picture if not in Batch
                        });
                    }
                });
            });
        }

        // 4. Get Existing Reports
        // Reports are stored with courseName... wait, this is tricky. 
        // LabReport model might store courseName, not courseId. 
        // Let's check LabReport model. If it stores courseName string, we still need the name.
        // But we have the correct course object now.
        const reports = await LabReport.find({ courseName: course.name })
            .populate('studentId', 'username picture email');

        // 5. Merge Data
        // We want a list of reports. If a student has no report, we create a mock one.
        // Map enrolled students to reports

        const mergedReports = await Promise.all(enrolledStudents.map(async (student) => {
            // Check if report exists
            const existingReport = reports.find(r => r.studentId?.username === student.username);

            if (existingReport) return existingReport;

            // If no report, we need to create a temporary object that LOOKS like a report
            const user = await User.findOne({ username: student.username }).select('username picture email');

            return {
                _id: 'temp_' + student.username, // temporary ID
                studentId: user || { username: student.username, picture: null },
                courseName: course.name, // FIXED: Use course.name instead of courseName
                totalTimeSpent: 0,
                lastActive: null,
                files: []
            };
        }));

        // Also include reports from students NOT in the batch? (e.g. dropouts or errors). 
        // Yes, append any reports that weren't matched.
        reports.forEach(r => {
            if (r.studentId && !enrolledStudents.find(e => e.username === r.studentId.username)) {
                mergedReports.push(r);
            }
        });

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
app.post('/lab/add-student', async (req, res) => {
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

// 3. Heartbeat (Student Pulse)
app.post('/lab/heartbeat', async (req, res) => {
    try {
        const { sessionId, username, status, activeFile, code } = req.body;
        // console.log(`[HEARTBEAT] ${username} | session: ${sessionId} | status: ${status} | file: ${activeFile} | code len: ${(code || '').length}`);
        if (!sessionId || !username) return res.status(400).json({ error: "sessionId and username required" });

        const session = await LabSession.findById(sessionId);
        if (!session) {
            console.warn(`[HEARTBEAT FAIL] Session ${sessionId} not found for user ${username}`);
            return res.status(404).json({ error: "Session not found" });
        }

        // GLOBAL STATE INTEGRATION
        if (!liveLabState[sessionId]) liveLabState[sessionId] = {};
        const currentLiveState = liveLabState[sessionId][username];

        // REMOVED Zombie Check: It was blocking valid logins.

        const student = session.activeStudents.find(s => s.username === username);
        if (student) {
            student.lastHeartbeat = new Date();
            student.currentStatus = status || 'active';
        } else {
            session.activeStudents.push({
                username,
                loginTime: new Date(),
                lastHeartbeat: new Date(),
                currentStatus: status || 'active'
            });
        }

        await session.save();

        // Update Live State
        // GUARD: If student is explicitly 'offline', don't let a heartbeat flip them back to 'active'.
        // Only a 'student-join-lab' socket event should resurrected them.
        if (liveLabState[sessionId][username]?.status === 'offline' && (!status || status === 'active')) {
            // Still offline, but we update the other fields if needed
            liveLabState[sessionId][username] = {
                ...(liveLabState[sessionId][username] || {}),
                lastHeartbeat: new Date(), // internally track heartbeat
                code: code || currentLiveState?.code || '',
                activeFile: activeFile || currentLiveState?.activeFile || null
            };
        } else {
            liveLabState[sessionId][username] = {
                ...(liveLabState[sessionId][username] || {}),
                username,
                status: status || 'active',
                lastActive: new Date().toLocaleTimeString(),
                code: code || currentLiveState?.code || '',
                activeFile: activeFile || currentLiveState?.activeFile || null,
                language: currentLiveState?.language || 'javascript'
            };
        }

        if (io) {
            console.log(`[DIAGNOSTIC] HEARTBEAT from ${username} (HTTP Request). Status: ${status}. Session: ${sessionId}`);
            io.to(`lab-${sessionId}`).emit('student-data-update', liveLabState[sessionId][username]);
        } else {
            console.warn('[HEARTBEAT] io not initialized yet');
        }

        // --- NEW: UPDATE HISTORICAL REPORT ---
        // Verify we have enough info to update the permanent record
        // Heartbeats come every ~10s. We'll add 10s to the report.
        if (status === 'active') {
            try {
                // Populate course if needed to get name
                if (!session.populated('courseId')) {
                    await session.populate('courseId');
                }

                const courseName = session.courseId ? session.courseId.name : session.subject;
                const courseId = session.courseId ? session.courseId._id : null;

                // Find or Create Report
                // We use findOneAndUpdate for atomic upsert if possible, but complex logic suggests find/save
                let report = await LabReport.findOne({ studentId: student?._id || session.activeStudents.find(s => s.username === username)?._id, courseName });

                // If student ID is not found in session active list (edge case), try user lookup
                if (!report) {
                    const user = await User.findOne({ username });
                    if (user) {
                        report = await LabReport.findOne({ studentId: user._id, courseName });
                        if (!report) {
                            report = new LabReport({
                                studentId: user._id,
                                courseId: courseId,
                                courseName: courseName,
                                files: [],
                                totalTimeSpent: 0
                            });
                        }
                    }
                }

                if (report) {
                    report.lastActive = new Date();
                    report.totalTimeSpent += 10; // Approx 10 seconds per heartbeat

                    // Update File Activity if provided
                    if (activeFile && code) {
                        const fileIndex = report.files.findIndex(f => f.fileName === activeFile);
                        if (fileIndex > -1) {
                            report.files[fileIndex].lastUpdated = new Date();
                            report.files[fileIndex].timeSpent += 10;
                            report.files[fileIndex].code = code;
                        } else {
                            report.files.push({
                                fileName: activeFile,
                                code: code,
                                timeSpent: 10,
                                lastUpdated: new Date(),
                                status: 'in-progress'
                            });
                        }
                    }

                    // NEW: SYNC BEAST METRICS FROM LIVE STATE
                    const liveData = liveLabState[sessionId]?.[username];
                    if (liveData) {
                        report.tabSwitchCount = liveData.tabSwitchCount || 0;
                        report.pasteCount = liveData.pasteCount || 0;
                        report.attentionScore = liveData.attentionScore || 100;
                    }

                    await report.save();
                }
            } catch (reportErr) {
                console.error("[HEARTBEAT] Failed to update LabReport:", reportErr.message);
                // Don't fail the request, just log error
            }
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
app.use('/api', courseManager);

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
app.use('/login', authLimiter);
app.use('/register', authLimiter);
app.use('/auth', authLimiter);
app.use('/ai', aiLimiter);

// --- SESSION SETUP FOR PASSPORT ---
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// --- PASSPORT GITHUB STRATEGY ---

passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (obj, done) {
    done(null, obj);
});

passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: GITHUB_CALLBACK_URL
},
    async function (accessToken, refreshToken, profile, done) {
        try {
            // 1. Try to find by GitHub ID
            let user = await User.findOne({ githubId: profile.id });

            // 2. If not found, try to find by Email (to link accounts)
            if (!user && profile.emails && profile.emails.length > 0) {
                const email = profile.emails[0].value;
                user = await User.findOne({ email: email });
                if (user) {
                    // Link GitHub to existing account
                    user.githubId = profile.id;
                    user.githubToken = accessToken;
                    user.githubUsername = profile.username;
                    // Optional: Update picture if missing
                    if (!user.picture && profile.photos && profile.photos[0]) {
                        user.picture = profile.photos[0].value;
                    }
                    await user.save();
                }
            }

            // 3. If still not found, create new user
            if (!user) {
                // Determine unique username
                let uniqueUsername = profile.username;
                let counter = 1;
                while (await User.findOne({ username: uniqueUsername })) {
                    uniqueUsername = `${profile.username}${counter}`;
                    counter++;
                }

                user = new User({
                    username: uniqueUsername,
                    githubId: profile.id,
                    githubToken: accessToken,
                    githubUsername: profile.username,
                    email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
                    picture: profile.photos && profile.photos[0] ? profile.photos[0].value : null
                });
                await user.save();
            } else {
                // 4. Update existing user (GitHub ID found or just linked)
                user.githubToken = accessToken;
                user.githubUsername = profile.username;
                if (!user.picture && profile.photos && profile.photos[0]) {
                    user.picture = profile.photos[0].value;
                }
                await user.save();
            }
            return done(null, user);
        } catch (err) {
            return done(err, null);
        }
    }
));


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

// (Body parsing middleware moved to top, before lab routes)

// Mount AI routes
app.use('/ai', aiRouter);
app.use('/api', courseManager); // Handles /courses and /batches
app.use('/api/assignments', assignmentManager); // Handles /assignments

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
    express.static(dir)(req, res, next);
});
app.use('/sites/:userId', (req, res, next) => {
    const dir = path.join(baseSitesDir, req.params.userId);
    express.static(dir)(req, res, next);
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
    })
    .catch(err => console.error("âŒ FAILURE: MongoDB Connection Error:", err.message));

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

app.post('/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Username and password required" });
        if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
        const hashedPassword = await bcrypt.hash(password, 10);
        const userRole = (role === 'faculty') ? 'faculty' : 'student'; // Validate role
        const newUser = new User({ username, password: hashedPassword, role: userRole });
        await newUser.save();
        res.status(201).json({ message: "User created", role: userRole });
    } catch (err) { res.status(400).json({ error: "User exists" }); }
});

app.post('/auth/google', async (req, res) => {
    const { token } = req.body;
    try {
        const ticket = await getGoogleClient().verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        const { name, email, picture, sub: googleId } = ticket.getPayload();

        let user = await User.findOne({ email });
        if (!user) {
            // Uniqueness Check: Ensure username is unique for new Google users
            let uniqueUsername = name;
            let counter = 1;
            while (await User.findOne({ username: uniqueUsername })) {
                uniqueUsername = `${name}${counter}`;
                counter++;
            }

            // Create new Google user
            user = new User({
                username: uniqueUsername,
                email,
                picture,
                googleId,
                password: null // No password for Google users
            });
            await user.save();
        } else {
            // Update picture if changed
            if (user.picture !== picture) {
                user.picture = picture;
                await user.save();
            }
        }

        const jwtToken = jwt.sign({ userId: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ token: jwtToken, username: user.username, userId: user._id, picture: user.picture, role: user.role });
    } catch (err) {
        console.error("Google Auth Error:", err);
        res.status(401).json({ error: "Google authentication failed" });
    }
});

// --- GITHUB AUTH ROUTES ---
app.get('/auth/github',
    passport.authenticate('github', { scope: ['user:email', 'repo'] }));

app.get('/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/login' }),
    function (req, res) {
        // Successful authentication
        const user = req.user;
        const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });

        // Redirect to frontend with token
        res.redirect(`${CLIENT_URL}?token=${token}&username=${user.username}&userId=${user._id}&picture=${encodeURIComponent(user.picture || "")}`);
    });

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

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Username and password required" });
        const user = await User.findOne({ username });
        if (user && user.password && await bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ userId: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
            res.json({ token, username: user.username, userId: user._id, picture: user.picture, role: user.role });
        } else {
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch (err) {
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

        const newFile = new File({
            name,
            type: 'file',
            content: content || '',
            owner: req.user.userId,
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
app.get('/files', authenticate, async (req, res) => { /* Keep existing */
    try {
        const { courseId } = req.query;
        const query = { $or: [{ owner: req.user.userId }, { sharedWith: req.user.username }] };

        if (courseId) {
            query.courseId = courseId;
        } else {
            // If no courseId specified, only return "root" project files (files without courseId)
            query.courseId = { $exists: false };
        }

        const files = await File.find(query);
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: "Error" });
    }
});
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
    app.get('/lab/session-activity-log/:sessionId', authenticate, async (req, res) => {
        try {
            const session = await LabSession.findById(req.params.sessionId).select('activityLog');
            if (!session) return res.status(404).json({ error: 'Session not found' });
            res.json(session.activityLog);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

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
    socket.on('student-join-lab', ({ sessionId, username, userId, initialData }) => {
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
                lastActive: new Date().toLocaleTimeString(),
                code: initialData?.code || '',
                activeFile: initialData?.activeFile || null,
                language: initialData?.language || 'javascript'
            };

            // Merge with existing if present to avoid overwriting code with empty if reconnecting without data
            // But we prefer fresh data if provided
            liveLabState[sessionId][username] = { ...liveLabState[sessionId][username], ...state };

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
            // GUARD: If offline, don't let code update flip back to active
            if (liveLabState[sessionId][username]?.status === 'offline') return;

            liveLabState[sessionId][username] = {
                ...(liveLabState[sessionId][username] || {}),
                username,
                status: 'active',
                lastActive: new Date().toLocaleTimeString(),
                code: code || '',
                activeFile: fileName || 'untitled',
                language: language || 'javascript'
            };
            console.log(`[DIAGNOSTIC] STUDENT CODE UPDATE: ${username} (Socket: ${socket.id}) for session ${sessionId}`);
            io.to(`lab-${sessionId}`).emit('student-data-update', liveLabState[sessionId][username]);
        }
    });

    // Student explicitly leaves (Logout button)
    socket.on('student-leave-lab', ({ sessionId, username, userId }) => {
        if (sessionId && username) {
            console.log(`[LAB] Student ${username} explicitly left session ${sessionId}`);
            if (liveLabState[sessionId] && liveLabState[sessionId][username]) {
                liveLabState[sessionId][username].status = 'offline';
                liveLabState[sessionId][username].lastActive = new Date().toLocaleTimeString();

                // Notify faculty
                console.log(`[DIAGNOSTIC] STUDENT LEAVE LAB: ${username} (Socket: ${socket.id}) for session ${sessionId}`);
                io.to(`lab-${sessionId}`).emit('student-data-update', {
                    username,
                    status: 'offline',
                    lastActive: new Date().toLocaleTimeString()
                });
            }
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
            // Check if name already includes path (e.g. from template or bulk sync)
            const f = new File({ name, type: newNode.type, parentId: parentId || 'root', owner: userId, content: content, sharedWith: collaborators });

            // If in a lab, we might want to tag the metadata or just use parentId hierarchy
            // For now, we rely on the parentId being the lab root if created via LabMode
            await f.save();

            // Determine actual disk path based on hierarchy
            const relativePath = await getFileRelativePath(f._id);
            const nodeUserDir = courseId ? getLabDir(userId, courseId) : getUserDir(userId);
            const fullPathOnDisk = path.join(nodeUserDir, relativePath);

            if (newNode.type === 'file') {
                const dir = path.dirname(fullPathOnDisk);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
                env: { ...process.env, TERM: 'xterm-256color' },
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
            if (liveLabState[sessionId] && liveLabState[sessionId][username]) {
                liveLabState[sessionId][username].status = 'offline';
                liveLabState[sessionId][username].lastActive = new Date().toLocaleTimeString();
                // Notify faculty
                io.to(`lab-${sessionId}`).emit('student-data-update', {
                    username,
                    status: 'offline',
                    lastActive: new Date().toLocaleTimeString()
                });
            }
            delete socketToUser[socket.id];
        }
    });

    // --- VAYU LAB MONITOR SOCKETS ---
    socket.on('join-session', ({ sessionId, username, role }) => {
        socket.join(`session_${sessionId}`);
        if (role === 'student') {
            // Notify faculty that student is online
            io.to(`session_${sessionId}_faculty`).emit('student-status-change', { username, status: 'online' });
        }
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // BEAST FEATURES: Advanced Behavior Tracking
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        // Tab Switch Tracking â€” fires when student leaves the lab tab
        socket.on('student-tab-switch', ({ sessionId, username, direction, switchCount }) => {
            if (!sessionId || !username) return;
            if (!liveLabState[sessionId]) liveLabState[sessionId] = {};
            if (!liveLabState[sessionId][username]) liveLabState[sessionId][username] = {};

            // Update live state
            liveLabState[sessionId][username].tabSwitchCount = switchCount || 0;

            // GUARD: If offline, don't let behavioral updates flip back to active
            if (liveLabState[sessionId][username].status !== 'offline') {
                liveLabState[sessionId][username].status = direction === 'left' ? 'distracted' : (liveLabState[sessionId][username].prevStatus || 'active');
                if (direction === 'left') liveLabState[sessionId][username].prevStatus = liveLabState[sessionId][username].status;
            }

            // Recompute attention score
            const tabPenalty = Math.min(switchCount * 5, 40);
            const pastePenalty = Math.min((liveLabState[sessionId][username].pasteCount || 0) * 8, 30);
            liveLabState[sessionId][username].attentionScore = Math.max(0, 100 - tabPenalty - pastePenalty);

            // Notify faculty in the room
            io.to(`lab-${sessionId}`).emit('student-data-update', {
                ...liveLabState[sessionId][username],
                lastActive: new Date().toLocaleTimeString()
            });

            // Log to DB
            LabSession.findByIdAndUpdate(sessionId, {
                $push: {
                    activityLog: {
                        username,
                        event: 'tab-switch',
                        details: `Tab Switched: ${switchCount}`,
                        timestamp: new Date()
                    }
                }
            }).catch(() => { });

            console.log(`[LAB] Tab switch #${switchCount} â€” ${username} ${direction} (session ${sessionId})`);
        });

        // Paste Detection â€” fires when student pastes in the editor
        socket.on('student-paste', ({ sessionId, username, charCount, pasteCount }) => {
            if (!sessionId || !username) return;
            if (!liveLabState[sessionId]) liveLabState[sessionId] = {};
            if (!liveLabState[sessionId][username]) liveLabState[sessionId][username] = {};

            liveLabState[sessionId][username].pasteCount = pasteCount || 0;

            // Recompute attention score
            const tabPenalty = Math.min((liveLabState[sessionId][username].tabSwitchCount || 0) * 5, 40);
            const pastePenalty = Math.min(pasteCount * 8, 30);
            liveLabState[sessionId][username].attentionScore = Math.max(0, 100 - tabPenalty - pastePenalty);

            // GUARD: If offline, don't let behavioral updates flip back to active
            if (liveLabState[sessionId][username].status !== 'offline') {
                io.to(`lab-${sessionId}`).emit('student-data-update', {
                    ...liveLabState[sessionId][username],
                    suspicious: charCount > 80,
                    lastActive: new Date().toLocaleTimeString()
                });
            }

            LabSession.findByIdAndUpdate(sessionId, {
                $push: {
                    activityLog: {
                        username,
                        event: 'paste-detected',
                        details: `${charCount} chars pasted (total: ${pasteCount})`,
                        timestamp: new Date()
                    }
                }
            }).catch(() => { });

            console.log(`[LAB] Paste #${pasteCount} by ${username} â€” ${charCount} chars`);
        });

        // Faculty Announces to all students in session
        socket.on('faculty-announcement', ({ sessionId, message }) => {
            if (!sessionId || !message) return;
            // Broadcast to everyone in the lab room (students are there too)
            io.to(`lab-${sessionId}`).emit('faculty-announcement', { message, timestamp: new Date().toLocaleTimeString() });

            LabSession.findByIdAndUpdate(sessionId, {
                $push: {
                    activityLog: {
                        username: 'faculty',
                        event: 'announcement',
                        details: message,
                        timestamp: new Date()
                    }
                }
            }).catch(() => { });

            console.log(`[LAB] Faculty announcement in session ${sessionId}: "${message}"`);
        });

        // Student raises hand
        socket.on('student-raise-hand', ({ sessionId, username }) => {
            if (!sessionId || !username) return;
            if (!liveLabState[sessionId]) liveLabState[sessionId] = {};
            if (!liveLabState[sessionId][username]) liveLabState[sessionId][username] = {};

            liveLabState[sessionId][username].raiseHand = true;

            io.to(`lab-${sessionId}`).emit('student-raise-hand', { username, timestamp: new Date().toLocaleTimeString() });

            LabSession.findByIdAndUpdate(sessionId, {
                $push: {
                    activityLog: {
                        username,
                        event: 'raise-hand',
                        details: 'Student requested help',
                        timestamp: new Date()
                    }
                }
            }).catch(() => { });
            console.log(`[LAB] ${username} raised hand in session ${sessionId}`);
        });

        // Faculty acknowledges raised hand
        socket.on('faculty-acknowledge', ({ sessionId, username }) => {
            if (!sessionId || !username) return;
            if (liveLabState[sessionId] && liveLabState[sessionId][username]) {
                liveLabState[sessionId][username].raiseHand = false;
            }
            io.to(`lab-${sessionId}`).emit('faculty-acknowledge', { username });

            LabSession.findByIdAndUpdate(sessionId, {
                $push: {
                    activityLog: {
                        username,
                        event: 'hand-acknowledged',
                        details: 'Faculty acknowledged help request',
                        timestamp: new Date()
                    }
                }
            }).catch(() => { });
            // --- REPAIRED END OF FILE ---
        });
    });
});

process.on('SIGTERM', () => {
    console.log('[SHUTDOWN] SIGTERM received.');
    if (server) server.close(() => process.exit(0));
    else process.exit(0);
});

// Final Railway Stability Fix: Start listening only after all middleware and routes are registered
const finalPortSource = initialPort ? 'Railway Environment' : (process.env.PORT ? '.env file' : 'Fallback');
server.listen(PORT, HOST, () => {
    console.log(`[BOOT] Server successfully started on ${HOST}:${PORT}`);
    console.log(`[BOOT] PORT Source: ${finalPortSource}`);
    console.log(`[BOOT] Platform: ${process.platform}, Node: ${process.version}`);
});
