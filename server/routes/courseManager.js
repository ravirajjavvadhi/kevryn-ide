const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const Batch = require('../models/Batch');
const User = require('../User');
const LabSession = require('../LabSessionModel');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const AptitudeSubmission = require('../models/AptitudeSubmission');
const { authenticate } = require('../utils/authMiddleware'); // Assume auth middleware exists or will be moved

// --- GLOBAL CATALOG FOR FACULTY MANUAL CREATION ---
router.get('/catalog/structure', authenticate, async (req, res) => {
    try {
        const CollegeStructure = require('../models/CollegeStructure');
        const cId = req.user.collegeId === 'undefined' || req.user.collegeId === 'null' ? null : req.user.collegeId;
        const query = cId ? { collegeId: cId } : {};
        const structures = await CollegeStructure.find(query);
        res.json(structures);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch structure" });
    }
});

router.get('/catalog/courses', authenticate, async (req, res) => {
    try {
        const cId = req.user.collegeId === 'undefined' || req.user.collegeId === 'null' ? null : req.user.collegeId;
        const query = cId ? { collegeId: cId } : {};
        // Only fetch global admin courses (where facultyId doesn't exist)
        const courses = await Course.find({ ...query, facultyId: { $exists: false } }).sort({ department: 1, year: 1, name: 1 });
        res.json(courses);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch global courses" });
    }
});

// --- COURSE MANAGEMENT ---

// 1. Create a New Course
router.post('/courses', authenticate, async (req, res) => {
    try {
        const { name, code, semester, description } = req.body;

        const newCourse = new Course({
            facultyId: req.user.userId,
            collegeId: req.user.collegeId || undefined,
            name,
            code,
            semester,
            description
        });

        await newCourse.save();
        res.json({ success: true, course: newCourse });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Get All Courses for Faculty
router.get('/courses', authenticate, async (req, res) => {
    try {
        const query = { facultyId: req.user.userId };
        // FALLBACK: Show courses that match college OR have no college (legacy)
        if (req.user.collegeId) {
            query.$or = [
                { collegeId: req.user.collegeId },
                { collegeId: { $exists: false } },
                { collegeId: null }
            ];
        }

        const courses = await Course.find(query)
            .populate('batches')
            .sort({ createdAt: -1 });
        res.json(courses);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Get Specific Course Details
router.get('/courses/:id', authenticate, async (req, res) => {
    try {
        const query = { _id: req.params.id };
        if (req.user.collegeId) query.collegeId = req.user.collegeId;

        const course = await Course.findOne(query).populate('batches');
        if (!course) return res.status(404).json({ error: "Course not found or access denied" });
        res.json(course);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3.5 Delete Course
router.delete('/courses/:id', authenticate, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ error: "Course not found" });

        if (course.facultyId.toString() !== req.user.userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // 1. Find all batches for this course
        const batches = await Batch.find({ courseId: course._id });

        // 2. Remove these batches from any Enrolled Students
        for (const batch of batches) {
            // For every student in this batch, remove the batch ID from their profile
            // This can be slow if there are thousands, but for now it's fine.
            await User.updateMany(
                { enrolledBatches: batch._id },
                { $pull: { enrolledBatches: batch._id } }
            );
        }

        // 3. Delete Batches
        await Batch.deleteMany({ courseId: course._id });

        // 4. Delete Course
        await Course.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: "Course and associated batches deleted" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- BATCH MANAGEMENT ---

// 4. Add a Batch to a Course
router.post('/courses/:id/batches', authenticate, async (req, res) => {
    try {
        const { name, schedule, year, section } = req.body;
        const course = await Course.findById(req.params.id);

        if (!course) return res.status(404).json({ error: "Course not found" });
        if (course.facultyId.toString() !== req.user.userId) return res.status(403).json({ error: "Unauthorized" });

        const newBatch = new Batch({
            collegeId: req.user.collegeId || undefined,
            courseId: course._id,
            name,
            year,
            section,
            schedule
        });

        await newBatch.save();

        // Link batch to course
        course.batches.push(newBatch._id);
        await course.save();

        res.json({ success: true, batch: newBatch });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. Enroll Students in a Batch
router.post('/batches/:id/enroll', authenticate, async (req, res) => {
    try {
        const { students } = req.body; // Array of usernames
        const batch = await Batch.findById(req.params.id).populate('courseId');

        if (!batch) return res.status(404).json({ error: "Batch not found" });

        // Verify Faculty Ownership
        // batch.courseId is the populated Course object
        if (batch.courseId.facultyId.toString() !== req.user.userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const stats = { success: [], failed: [] };

        for (const username of students) {
            const student = await User.findOne({ username });
            if (!student) {
                stats.failed.push({ username, reason: "User not found" });
                continue;
            }
            if (student.role !== 'student') {
                stats.failed.push({ username, reason: "User is not a student" });
                continue;
            }

            // Check if already enrolled
            const isEnrolled = batch.students.some(s => s.username === username);
            if (isEnrolled) {
                stats.failed.push({ username, reason: "Already enrolled" });
                continue;
            }

            // Add to Batch
            batch.students.push({
                username,
                email: student.email,
                enrollmentDate: new Date()
            });

            // Add to Student's User Profile
            if (!student.enrolledBatches.includes(batch._id)) {
                student.enrolledBatches.push(batch._id);
                await student.save();
            }

            // Add to Course's enrolledStudents to ensure "All Enrolled Students" works
            if (!batch.courseId.enrolledStudents.includes(username)) {
                batch.courseId.enrolledStudents.push(username);
                await batch.courseId.save();
            }

            stats.success.push(username);
        }

        await batch.save();
        res.json({ success: true, stats, batch });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 6. Remove Student from Batch (Optional utility)
router.post('/batches/:id/remove-student', authenticate, async (req, res) => {
    try {
        const { username } = req.body;
        const batch = await Batch.findById(req.params.id).populate('courseId');
        if (!batch) return res.status(404).json({ error: "Batch not found" });
        if (batch.courseId.facultyId.toString() !== req.user.userId) return res.status(403).json({ error: "Unauthorized" });

        // Remove from Batch
        batch.students = batch.students.filter(s => s.username !== username);
        await batch.save();

        // Remove from Student's Profile
        const student = await User.findOne({ username });
        if (student) {
            student.enrolledBatches = student.enrolledBatches.filter(b => b.toString() !== batch._id.toString());
            await student.save();
        }

        res.json({ success: true, message: "Student removed" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7. Get Enrolled Courses for Student
router.get('/student/enrolled-courses', authenticate, async (req, res) => {
    try {
        const student = await User.findById(req.user.userId).populate({
            path: 'enrolledBatches',
            populate: { path: 'courseId' }
        });

        if (!student) return res.status(404).json({ error: "Student not found" });

        // Extract unique courses from enrolled batches
        const coursesMap = new Map();
        student.enrolledBatches.forEach(batch => {
            if (batch.courseId) {
                if (req.user.collegeId && batch.courseId.collegeId && batch.courseId.collegeId.toString() !== req.user.collegeId.toString()) {
                    return;
                }
                coursesMap.set(batch.courseId._id.toString(), batch.courseId);
            }
        });

        // Add courses matching student's department and year
        if (student.department && student.year) {
            const query = { department: student.department, year: student.year };
            if (req.user.collegeId) query.collegeId = req.user.collegeId;
            const deptCourses = await Course.find(query);
            deptCourses.forEach(course => {
                coursesMap.set(course._id.toString(), course);
            });
        }

        res.json(Array.from(coursesMap.values()));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Compact, verified data for the Student Command Center.  This replaces the
// old placeholder stats without exposing another student's data.
router.get('/student/command-summary', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
        const student = await User.findById(req.user.userId).select('username rollNumber name department year section enrolledBatches collegeId').lean();
        if (!student) return res.status(404).json({ error: 'Student not found' });
        const scope = req.user.collegeId ? { collegeId: req.user.collegeId } : {};
        const cohort = { targetDepartment: student.department, targetYear: student.year, targetSection: student.section };
        const [courses, labs, cohortAssignments, collegeAssignmentIds, aptitude] = await Promise.all([
            Course.find({ ...scope, department: student.department, year: student.year }).select('name code').lean(),
            LabSession.find({ ...scope, startTime: { $lte: new Date() }, $or: [{ allowedStudents: student.username }, { 'activeStudents.username': student.username }, { 'activityLog.username': student.username }] }).select('sessionName subject startTime isActive allowedStudents activeStudents activityLog').sort({ startTime: -1 }).limit(100).lean(),
            Assignment.find({ ...scope, $or: [cohort, { batchId: { $in: student.enrolledBatches || [] } }] }).select('title startTime endTime maxPoints subjectName').lean(),
            Assignment.find(scope).select('_id').lean(),
            AptitudeSubmission.find({ studentId: student._id }).populate('testId', 'title totalMarks').select('testId totalScore submittedAt').lean()
        ]);
        // Match the student assignment endpoint: cohort work plus work for any
        // course available to this student.  A dashboard count must use the
        // exact same audience rules as the assessment popup.
        const courseIds = courses.map(course => course._id);
        const courseAssignments = courseIds.length
            ? await Assignment.find({ ...scope, courseId: { $in: courseIds } }).select('title startTime endTime maxPoints subjectName').lean()
            : [];
        const assignmentMap = new Map([...cohortAssignments, ...courseAssignments].map(item => [String(item._id), item]));
        const assignments = [...assignmentMap.values()];
        const submissions = await Submission.find({ studentUsername: student.username, assignmentId: { $in: collegeAssignmentIds.map(item => item._id) } }).select('assignmentId score maxScore status submittedAt').lean();
        const attended = labs.filter(lab => (lab.activeStudents || []).some(item => item.username === student.username) || (lab.activityLog || []).some(item => item.username === student.username && item.event?.type === 'login')).length;
        const now = new Date();
        const submittedAssignmentIds = new Set(submissions.map(item => String(item.assignmentId)));
        const pendingAssignments = assignments.filter(item => (!item.startTime || new Date(item.startTime) <= now) && (!item.endTime || new Date(item.endTime) >= now) && !submittedAssignmentIds.has(String(item._id))).length;
        const scored = submissions.filter(item => ['submitted', 'graded'].includes(item.status));
        const averageScore = scored.length ? Math.round(scored.reduce((total, item) => total + ((item.score || 0) / (item.maxScore || 100)) * 100, 0) / scored.length) : null;
        res.json({
            identity: { rollNumber: student.rollNumber || student.username, username: student.username, name: student.name || '', department: student.department || '', year: student.year || '', section: student.section || '' },
            insights: { labsConducted: labs.length, labsAttended: attended, attendancePercentage: labs.length ? Math.round((attended / labs.length) * 100) : 0, coursesEnrolled: courses.length, pendingAssignments, submittedAssignments: submissions.length, averageScore, aptitudeAttempts: aptitude.length },
            recentResults: submissions.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)).slice(0, 2).map(item => ({ type: 'assignment', score: item.score, maxScore: item.maxScore, submittedAt: item.submittedAt })),
            freshness: new Date().toISOString()
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
