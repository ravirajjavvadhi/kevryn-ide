const express = require('express');
const router = express.Router();
const College = require('../models/College');
const User = require('../User');
const { authenticate } = require('../utils/authMiddleware');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'kevryn_secret_2024';

// --- MIDDLEWARE: Admin-only ---
const checkAdmin = async (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Access denied. Admin only." });
    }
    next();
};

// ================================================
// ADMIN ROUTES — College CRUD
// ================================================

// 1. Create College (auto-generates code + inviteToken)
router.post('/admin/colleges', authenticate, checkAdmin, async (req, res) => {
    try {
        const { name, logo, address, contactEmail } = req.body;
        if (!name) return res.status(400).json({ error: "College name is required" });

        const college = new College({ name, logo, address, contactEmail });
        await college.save(); // pre-validate hook generates code + inviteToken

        const SERVER_URL = process.env.SERVER_URL || process.env.CLIENT_URL || 'http://localhost:3000';
        const inviteLink = `${SERVER_URL}/join/${college.inviteToken}`;

        res.json({
            college,
            inviteLink,
            message: `College "${name}" created with code: ${college.code}`
        });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ error: "A college with that name/code already exists" });
        res.status(500).json({ error: e.message });
    }
});

// 2. List All Colleges (with user counts)
router.get('/admin/colleges', authenticate, checkAdmin, async (req, res) => {
    try {
        const colleges = await College.find().sort({ createdAt: -1 });

        // Enrich with user counts
        const enriched = await Promise.all(colleges.map(async (c) => {
            const facultyCount = await User.countDocuments({ collegeId: c._id, role: 'faculty' });
            const studentCount = await User.countDocuments({ collegeId: c._id, role: { $in: ['student', 'user'] } });
            return {
                ...c.toObject(),
                facultyCount,
                studentCount,
                totalUsers: facultyCount + studentCount
            };
        }));

        res.json(enriched);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Get Single College Detail
router.get('/admin/colleges/:id', authenticate, checkAdmin, async (req, res) => {
    try {
        const college = await College.findById(req.params.id);
        if (!college) return res.status(404).json({ error: "College not found" });
        res.json(college);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Update College
router.patch('/admin/colleges/:id', authenticate, checkAdmin, async (req, res) => {
    try {
        const { name, logo, address, contactEmail, isActive } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (logo !== undefined) update.logo = logo;
        if (address !== undefined) update.address = address;
        if (contactEmail !== undefined) update.contactEmail = contactEmail;
        if (isActive !== undefined) update.isActive = isActive;

        const college = await College.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!college) return res.status(404).json({ error: "College not found" });
        res.json(college);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. Delete (Deactivate) College
router.delete('/admin/colleges/:id', authenticate, checkAdmin, async (req, res) => {
    try {
        const college = await College.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
        if (!college) return res.status(404).json({ error: "College not found" });
        res.json({ message: `College "${college.name}" deactivated`, college });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 6. List All Members of a College
router.get('/admin/colleges/:id/members', authenticate, checkAdmin, async (req, res) => {
    try {
        const users = await User.find({ collegeId: req.params.id }).select('-password').sort({ role: 1, username: 1 });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7. Admin: Assign user to a college manually
router.patch('/admin/users/:id/college', authenticate, checkAdmin, async (req, res) => {
    try {
        const { collegeId } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { collegeId }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 8. Admin: List unassigned users (no college)
router.get('/admin/unassigned-users', authenticate, checkAdmin, async (req, res) => {
    try {
        const users = await User.find({ $or: [{ collegeId: null }, { collegeId: { $exists: false } }] })
            .select('-password')
            .sort({ role: 1, username: 1 });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ================================================
// USER ROUTES — Join College (ANY authenticated user)
// ================================================

// THE KEY ENDPOINT: Enter code → permanently bind to college
router.post('/college/join', authenticate, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: "College code is required" });

        // 1. Check if user ALREADY has a college (PERMANENT — no changing)
        const currentUser = await User.findById(req.user.userId);
        if (!currentUser) return res.status(404).json({ error: "User not found" });

        if (currentUser.collegeId) {
            const existingCollege = await College.findById(currentUser.collegeId);
            return res.status(400).json({
                error: `You are already permanently enrolled in "${existingCollege?.name || 'a college'}". College binding cannot be changed.`
            });
        }

        // 2. Find college by code (case-insensitive)
        const college = await College.findOne({ code: code.toUpperCase().trim(), isActive: true });
        if (!college) return res.status(404).json({ error: "Invalid college code. Please check with your administrator." });

        // 3. Permanently bind user to this college
        currentUser.collegeId = college._id;
        await currentUser.save();

        // 4. Issue a NEW JWT with the collegeId baked in
        const newToken = jwt.sign({
            userId: currentUser._id,
            username: currentUser.username,
            role: currentUser.role,
            collegeId: college._id
        }, JWT_SECRET, { expiresIn: '7d' });

        console.log(`[COLLEGE] User ${currentUser.username} permanently joined "${college.name}" (${college.code})`);

        res.json({
            success: true,
            token: newToken,  // New JWT with collegeId
            college: {
                _id: college._id,
                name: college.name,
                code: college.code,
                logo: college.logo
            },
            message: `Successfully joined "${college.name}". This is permanent.`
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get current user's college info
router.get('/college/my', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).populate('collegeId');
        if (!user || !user.collegeId) {
            return res.json({ college: null, enrolled: false });
        }
        res.json({
            college: user.collegeId,
            enrolled: true
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Join via invite link token
router.get('/college/invite/:token', async (req, res) => {
    try {
        const college = await College.findOne({ inviteToken: req.params.token, isActive: true });
        if (!college) return res.status(404).json({ error: "Invalid or expired invite link" });
        // Return college info so the frontend can show "Join <College Name>"
        res.json({
            college: {
                _id: college._id,
                name: college.name,
                code: college.code,
                logo: college.logo
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
