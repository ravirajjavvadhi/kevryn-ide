const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticate } = require('../utils/authMiddleware');
const User = require('../User');
const LabSession = require('../LabSessionModel');
const Course = require('../models/Course');
const CollegeStructure = require('../models/CollegeStructure');

// Middleware to check if user is management
const checkManagement = (req, res, next) => {
    if (!['admin', 'college_admin'].includes(req.user.role)) {
        return res.status(403).json({ error: "Access denied. Management only." });
    }
    next();
};

// 1. Get Filters Data (Departments, Years, Sections, Courses)
router.get('/filters', authenticate, checkManagement, async (req, res) => {
    try {
        const cId = req.user.collegeId === 'undefined' || req.user.collegeId === 'null' ? null : req.user.collegeId;
        const query = cId ? { collegeId: cId } : {};
        
        // Get structure for dept/year/sec
        const structures = await CollegeStructure.find(query);
        const departments = [...new Set(structures.map(s => s.department))];
        
        // Get courses
        const courses = await Course.find(query).select('_id name department year code');
        
        res.json({ success: true, structures, departments, courses });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Get Recent Lab Sessions History
router.get('/history', authenticate, checkManagement, async (req, res) => {
    try {
        const cId = req.user.collegeId === 'undefined' || req.user.collegeId === 'null' ? null : req.user.collegeId;
        const query = cId ? { collegeId: cId } : {};
        
        // Fetch recent 10 sessions (active or inactive)
        const sessions = await LabSession.find(query)
            .sort({ startTime: -1 })
            .limit(10)
            .populate('facultyId', 'username name')
            .populate('courseId', 'name code');
            
        const formatted = sessions.map(s => {
            const totalAllowed = s.allowedStudents ? s.allowedStudents.length : 0;
            
            // Calculate unique attendees based on activeStudents array
            let attendees = 0;
            if (s.activeStudents && s.activeStudents.length > 0) {
                // If it's currently active, we count activeStudents array
                attendees = s.activeStudents.length;
            } else if (s.activityLog && s.activityLog.length > 0) {
                // If it's ended, we look at the activity log for unique logins
                const uniqueUsers = new Set();
                s.activityLog.forEach(log => {
                    if (log.event && log.event.type === 'login' && log.username) {
                        uniqueUsers.add(log.username);
                    }
                });
                attendees = uniqueUsers.size;
            }
            
            return {
                _id: s._id,
                sessionName: s.sessionName,
                subject: s.courseId ? s.courseId.name : s.subject,
                faculty: s.facultyId ? (s.facultyId.name || s.facultyId.username) : 'Unknown',
                startTime: s.startTime,
                endTime: s.endTime,
                isActive: s.isActive,
                totalAllowed,
                attendees
            };
        });
        
        res.json({ success: true, history: formatted });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Get Student Attendance Data
router.get('/student-attendance', authenticate, checkManagement, async (req, res) => {
    try {
        const { department, year, section, courseId } = req.query;
        const cId = req.user.collegeId === 'undefined' || req.user.collegeId === 'null' ? null : req.user.collegeId;
        
        // Build User query
        const userQuery = { role: 'student', isActiveStudent: { $ne: false } };
        if (cId) userQuery.collegeId = cId;
        if (department) userQuery.department = department;
        if (year) userQuery.year = year;
        if (section) userQuery.section = section;
        
        // Fetch matching students
        const students = await User.find(userQuery).select('username rollNumber name');
        
        // Fetch all lab sessions that match the filter (either by courseId or general)
        const sessionQuery = {};
        if (cId) sessionQuery.collegeId = cId;
        if (courseId) {
            sessionQuery.courseId = courseId;
        }
        
        // Find lab sessions that applied to these students
        // We look for sessions where allowedStudents intersects with our student list
        // To optimize, we just fetch sessions that match the courseId (if provided) and then check
        const sessions = await LabSession.find(sessionQuery).select('allowedStudents activityLog activeStudents courseId');
        
        // Build the stats map
        const studentStats = students.map(st => {
            const identifier = st.rollNumber || st.username;
            let labsConducted = 0;
            let labsAttended = 0;
            
            sessions.forEach(s => {
                // Was this student supposed to be in this lab?
                const isAllowed = s.allowedStudents && s.allowedStudents.includes(identifier);
                
                // If no course filter is applied, only count labs where they were explicitly allowed or attended.
                // If a course filter IS applied, and the lab matches the course, we might assume they should attend?
                // But `allowedStudents` is safer.
                
                let didAttend = false;
                
                // Check if they attended via activity log
                if (s.activityLog) {
                    didAttend = s.activityLog.some(log => log.event && log.event.type === 'login' && log.username === identifier);
                }
                
                // Check if they are currently active
                if (!didAttend && s.activeStudents) {
                    didAttend = s.activeStudents.some(active => active.username === identifier);
                }
                
                if (isAllowed || didAttend) {
                    labsConducted++;
                    if (didAttend) labsAttended++;
                }
            });
            
            return {
                id: st._id,
                username: st.username,
                rollNumber: st.rollNumber,
                name: st.name,
                labsConducted,
                labsAttended,
                attendancePercentage: labsConducted > 0 ? Math.round((labsAttended / labsConducted) * 100) : 0
            };
        });
        
        res.json({ success: true, data: studentStats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
