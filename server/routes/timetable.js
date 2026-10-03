const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const Timetable = require('../models/Timetable');
const { invalidateInstitutionOverview } = require('../services/managementIntelligence');
const CollegeStructure = require('../models/CollegeStructure');
const User = require('../User');
const LabSession = require('../LabSessionModel');
const { authenticate } = require('../utils/authMiddleware');

// Middleware to check Management Role (admin or college_admin)
const checkManagement = async (req, res, next) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'college_admin') {
            return res.status(403).json({ error: "Access denied. Management only." });
        }
        next();
    } catch (e) {
        res.status(500).json({ error: "Authorization error" });
    }
};

// ------------------------------------------------------------------
// 1. COLLEGE STRUCTURE (Management)
// ------------------------------------------------------------------

// Get College Structure with Student Counts
router.get('/structure', authenticate, checkManagement, async (req, res) => {
    try {
        const cId = req.user.collegeId === 'undefined' || req.user.collegeId === 'null' ? null : req.user.collegeId;
        const query = cId ? { collegeId: cId } : {};
        const structures = await CollegeStructure.find(query).lean();
        
        // Fetch student counts per section
        for (let struct of structures) {
            struct.sectionCounts = {};
            for (let sec of struct.sections) {
                const count = await User.countDocuments({
                    role: 'student',
                    department: struct.department,
                    year: struct.year,
                    section: sec,
                    isActiveStudent: { $ne: false },
                    collegeId: cId || undefined
                });
                struct.sectionCounts[sec] = count;
            }
        }
        
        res.json(structures);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Global Analytics
router.get('/analytics', authenticate, checkManagement, async (req, res) => {
    try {
        const cId = req.user.collegeId === 'undefined' || req.user.collegeId === 'null' ? null : req.user.collegeId;
        const query = cId ? { collegeId: cId } : {};
        
        const totalStudents = await User.countDocuments({ ...query, role: 'student' });
        const totalFaculty = await User.countDocuments({ ...query, role: 'faculty' });
        
        // Get today's day of week (e.g., 'Monday')
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const today = days[new Date().getDay()];
        
        const sessionsToday = await Timetable.countDocuments({ ...query, dayOfWeek: today });
        
        // Utilization: approx percentage of students having a lab today
        // (Just a simple metric for now)
        let utilization = 0;
        if (totalStudents > 0) {
            // Find unique students scheduled for a lab today
            const todaysLabs = await Timetable.find({ ...query, dayOfWeek: today });
            let scheduledStudents = 0;
            for (const lab of todaysLabs) {
                const count = await User.countDocuments({
                    role: 'student', isActiveStudent: { $ne: false },
                    department: lab.department, year: lab.year, section: lab.section,
                    collegeId: cId || undefined
                });
                scheduledStudents += count;
            }
            utilization = Math.min(Math.round((scheduledStudents / totalStudents) * 100), 100);
        }

        res.json({
            totalStudents,
            totalFaculty,
            sessionsToday,
            platformUtilization: `${utilization}%`
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create/Update College Structure (Define Sections for Dept & Year)
router.post('/structure', authenticate, checkManagement, async (req, res) => {
    try {
        const { department, year, sections } = req.body;
        if (!department || !year || !sections || !Array.isArray(sections)) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const cId = req.user.collegeId === 'undefined' || req.user.collegeId === 'null' ? null : req.user.collegeId;
        const collegeId = cId || undefined;
        
        let structure = await CollegeStructure.findOne({ collegeId, department, year });
        if (structure) {
            structure.sections = sections;
            await structure.save();
        } else {
            structure = new CollegeStructure({ collegeId, department, year, sections });
            await structure.save();
        }
        res.json({ success: true, structure });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ------------------------------------------------------------------
// 2. TIMETABLE MANAGER (Management)
// ------------------------------------------------------------------

router.get('/schedule', authenticate, checkManagement, async (req, res) => {
    try {
        const cId = req.user.collegeId === 'undefined' || req.user.collegeId === 'null' ? null : req.user.collegeId;
        const query = cId ? { collegeId: cId } : {};
        const schedule = await Timetable.find(query).populate('facultyId', 'username');
        res.json(schedule);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/schedule', authenticate, checkManagement, async (req, res) => {
    try {
        const { department, year, section, subjectName, subjectCode, facultyId, dayOfWeek, startTime, endTime } = req.body;
        
        const cId = req.user.collegeId === 'undefined' || req.user.collegeId === 'null' ? null : req.user.collegeId;
        const newEntry = new Timetable({
            collegeId: cId || undefined,
            department, year, section, subjectName, subjectCode, facultyId, dayOfWeek, startTime, endTime
        });
        await newEntry.save();
        res.json({ success: true, entry: newEntry });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/schedule/:id', authenticate, checkManagement, async (req, res) => {
    try {
        // SECURITY: Verify entry belongs to the same college
        const entry = await Timetable.findById(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Schedule not found' });
        if (req.user.role !== 'admin' && req.user.collegeId && entry.collegeId?.toString() !== req.user.collegeId?.toString()) {
            return res.status(403).json({ error: 'Cannot delete schedules from another college' });
        }
        await Timetable.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ------------------------------------------------------------------
// 3. STUDENT ONBOARDING & MANAGEMENT
// ------------------------------------------------------------------

// Get students by section
router.get('/students', authenticate, checkManagement, async (req, res) => {
    try {
        const { department, year, section } = req.query;
        if (!department || !year || !section) {
            return res.status(400).json({ error: "department, year, and section required" });
        }

        const cId = req.user.collegeId === 'undefined' || req.user.collegeId === 'null' ? null : req.user.collegeId;
        const query = { role: 'student', department, year, section };
        if (cId) query.collegeId = cId;
        
        const students = await User.find(query).select('-password');
        res.json(students);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Bulk add students via comma-separated roll numbers
router.post('/students/bulk-add', authenticate, checkManagement, async (req, res) => {
    try {
        const { department, year, section, rollNumbersString } = req.body;
        if (!department || !year || !section || !rollNumbersString) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        if (typeof rollNumbersString !== 'string') {
            return res.status(400).json({ error: "rollNumbersString must be a string" });
        }

        // Dynamically resolve college code instead of hardcoding
        const College = require('../models/College');
        let collegeCode = 'UNKNOWN';
        if (req.user.collegeId) {
            const adminCollege = await College.findById(req.user.collegeId);
            if (adminCollege) collegeCode = adminCollege.code;
        }

        const rollNumbers = rollNumbersString.split(',').map(r => r.trim()).filter(r => r);
        const addedUsers = [];
        const failedUsers = [];

        for (let roll of rollNumbers) {
            try {
                // Check if user exists
                let user = await User.findOne({ username: roll });
                if (user) {
                    failedUsers.push({ roll, reason: "Username already exists" });
                    continue;
                }
                
                // Password is the roll number itself
                const hashedPassword = await bcrypt.hash(roll, 10);
                
                user = new User({
                    username: roll,
                    password: hashedPassword,
                    rollNumber: roll,
                    role: 'student',
                    department,
                    year,
                    section,
                    collegeId: (req.user.collegeId === 'undefined' || req.user.collegeId === 'null') ? undefined : req.user.collegeId,
                    collegeCode: collegeCode,
                    isActiveStudent: true
                });
                
                await user.save();
                addedUsers.push(roll);
            } catch (err) {
                failedUsers.push({ roll, reason: err.message });
            }
        }

        res.json({ success: true, added: addedUsers.length, failed: failedUsers.length, failedUsers });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Deactivate Student
router.patch('/students/:id/toggle-active', authenticate, checkManagement, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        // SECURITY: college_admin can only toggle students in their own college
        if (req.user.role !== 'admin' && req.user.collegeId && user.collegeId?.toString() !== req.user.collegeId?.toString()) {
            return res.status(403).json({ error: "Cannot modify students from another college" });
        }
        
        user.isActiveStudent = !user.isActiveStudent;
        await user.save();
        
        res.json({ success: true, isActiveStudent: user.isActiveStudent });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ------------------------------------------------------------------
// 4. FACULTY & STUDENT DASHBOARD TIMETABLE
// ------------------------------------------------------------------

// Faculty: Get my schedule
router.get('/my-schedule/faculty', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'faculty') return res.status(403).json({ error: "Faculty only" });
        
        const schedule = await Timetable.find({ facultyId: req.user.userId }).sort({ dayOfWeek: 1, startTime: 1 });
        res.json(schedule);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Student: Get my schedule
router.get('/my-schedule/student', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.department || !user.year || !user.section) {
            return res.json([]); // Student not linked to a section
        }

        const schedule = await Timetable.find({ 
            department: user.department, 
            year: user.year, 
            section: user.section,
            collegeId: user.collegeId // SECURITY: Scope by college
        }).populate('facultyId', 'username').sort({ dayOfWeek: 1, startTime: 1 });
        
        res.json(schedule);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Faculty: Auto-start Lab from Timetable Entry
router.post('/start-lab/:timetableId', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'faculty') return res.status(403).json({ error: "Faculty only" });

        const timetableScope = req.user.collegeId ? { collegeId: req.user.collegeId } : {};
        const timetable = await Timetable.findOne({ _id: req.params.timetableId, ...timetableScope });
        if (!timetable) return res.status(404).json({ error: "Timetable entry not found" });

        // Ensure this faculty owns this timetable entry
        if (!timetable.facultyId || timetable.facultyId.toString() !== req.user.userId) {
            return res.status(403).json({ error: "Not authorized for this session" });
        }

        // Gather all active students in this Dept/Year/Section
        const students = await User.find({
            ...(req.user.collegeId ? { collegeId: req.user.collegeId } : {}),
            department: timetable.department,
            year: timetable.year,
            section: timetable.section,
            isActiveStudent: true,
            role: 'student'
        });

        const allowedStudents = students.map(s => s.username);

        // Auto-create LabSessionModel
        const sessionName = `${timetable.subjectName} (${timetable.department}-${timetable.year}-${timetable.section})`;
        
        // Calculate duration based on start/endTime (assuming HH:mm format)
        let duration = 120; // fallback
        try {
            const [sh, sm] = timetable.startTime.split(':').map(Number);
            const [eh, em] = timetable.endTime.split(':').map(Number);
            const startMins = sh * 60 + sm;
            const endMins = eh * 60 + em;
            duration = endMins - startMins;
            if (duration <= 0) duration = 120; // Handle overnight/errors
        } catch(e) {}

        const session = new LabSession({
            facultyId: req.user.userId,
            collegeId: timetable.collegeId || undefined,
            timetableId: timetable._id,
            sessionName: sessionName,
            subject: timetable.subjectName,
            semester: `Year ${timetable.year}`,
            duration: duration,
            allowedStudents: allowedStudents,
            // The choice is made immediately before launch and becomes a
            // fixed session rule. Existing timetable launches remain allowed
            // by default when the field is omitted.
            disablePreviousFileImport: req.body?.disablePreviousFileImport === true
        });

        await session.save();
        invalidateInstitutionOverview(timetable.collegeId || req.user.collegeId);
        
        // Notify all clients
        const io = req.app.get('io');
        if (io) {
            io.emit('session-started', session);
        }
        
        res.json({ success: true, session });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
