const express = require('express');
const router = express.Router();
const User = require('../User');
const LabSession = require('../LabSessionModel');
const Issue = require('../models/Issue');
const { authenticate } = require('../utils/authMiddleware');
const mongoose = require('mongoose');

// Middleware to check Admin role
const checkAdmin = async (req, res, next) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "Access denied. Admin only." });
        }
        next();
    } catch (e) {
        res.status(500).json({ error: "Authorization error" });
    }
};

// 1. Get All Users (with Filtering)
router.get('/users', authenticate, checkAdmin, async (req, res) => {
    try {
        const { role, search } = req.query;
        let query = {};

        if (role && role !== 'all') query.role = role;
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(query).select('-password').sort({ _id: -1 });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Toggle Faculty Status
router.patch('/users/:id/status', authenticate, checkAdmin, async (req, res) => {
    try {
        const { isFacultyActive } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isFacultyActive },
            { new: true }
        ).select('-password');
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2b. Change User Role (Admin, Faculty, Student)
router.patch('/users/:id/role', authenticate, checkAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['admin', 'faculty', 'student'].includes(role)) {
            return res.status(400).json({ error: "Invalid role specified" });
        }
        
        let updateData = { role };
        // If promoting to faculty, auto-approve them so they aren't stuck in "Pending"
        if (role === 'faculty') {
            updateData.isFacultyActive = true;
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        ).select('-password');
        
        res.json(user);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Admin Analytics
router.get('/analytics', authenticate, checkAdmin, async (req, res) => {
    try {
        // User Distribution
        const userCounts = await User.aggregate([
            { $group: { _id: "$role", count: { $sum: 1 } } }
        ]);

        // Active Sessions
        const activeSessions = await LabSession.countDocuments({ isActive: true });

        // Recent Issues (last 24h)
        const recentIssues = await Issue.countDocuments({
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });

        // Registration Trend (Last 7 days)
        const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const registrationTrend = await User.aggregate([
            { $match: { _id: { $gte: mongoose.Types.ObjectId.createFromTime(last7Days.getTime() / 1000) } } }, // Approx creation check via ObjectId if no createdAt field
            // Wait, User model doesn't have createdAt. Using ObjectId timestamp as fallback.
            // Actually, ObjectId contains timestamp.
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: { $toDate: "$_id" } } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const data = {
            userCounts,
            activeSessions,
            recentIssues,
            registrationTrend
        };
        console.log("Admin Analytics Data:", JSON.stringify(data, null, 2));
        res.json(data);
    } catch (e) {
        console.error("Analytics Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// 4. Get All Issues
router.get('/issues', authenticate, checkAdmin, async (req, res) => {
    try {
        const issues = await Issue.find().sort({ createdAt: -1 }).limit(100);
        res.json(issues);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Delete User (Deep Cascading Delete)
router.delete('/users/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: "Only admins can delete users" });
        if (req.user.userId === req.params.id) return res.status(400).json({ error: "Cannot delete yourself" });

        const userToDelete = await User.findById(req.params.id);
        if (!userToDelete) return res.status(404).json({ error: "User not found" });

        // Cascading Deletes Based on Role
        if (userToDelete.role === 'faculty') {
            // Find all courses taught by this faculty
            
            const courses = await Course.find({ facultyId: userToDelete._id });
            const courseIds = courses.map(c => c._id);

            // Delete Assignments from these courses
            await Assignment.deleteMany({ courseId: { $in: courseIds } });
            
            // Delete Batches from these courses
            await Batch.deleteMany({ courseId: { $in: courseIds } });

            // Delete the Courses themselves
            await Course.deleteMany({ facultyId: userToDelete._id });

            // Delete Lab Sessions
            await LabSession.deleteMany({ facultyId: userToDelete._id });

        } else if (userToDelete.role === 'student' || userToDelete.role === 'user') {
            
            // Remove student from any enrolled batches
            await Batch.updateMany(
                { "students.username": userToDelete.username },
                { $pull: { students: { username: userToDelete.username } } }
            );

            // Delete all their array submissions
            await Submission.deleteMany({ studentUsername: userToDelete.username });
        }

        // Wipe IDE files (Snippet, Files)
        
        await Snippet.deleteMany({ userId: userToDelete._id });
        await File.deleteMany({ owner: userToDelete._id });

        // Finally, delete the User document
        await User.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: "User and all associated data permanently deleted" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
