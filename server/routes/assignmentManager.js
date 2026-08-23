const express = require('express');
const router = express.Router();
const Assignment = require('../models/Assignment');
const User = require('../User');
const Course = require('../models/Course');
const Submission = require('../models/Submission');
const { authenticate } = require('../utils/authMiddleware');
const { runAutoGrader } = require('../utils/autoGrader');

// 1. Create Assignment (Faculty Only)
router.post('/', authenticate, async (req, res) => {
    try {
        const { courseId, batchId, title, description, language, starterCode, testCases, points, startTime, endTime, targetDepartment, targetYear, targetSection, subjectName } = req.body;

        // Verify Faculty Role
        if (req.user.role !== 'faculty') return res.status(403).json({ error: "Only faculty can create assignments" });

        // Verify Course Ownership & College (If courseId is provided)
        if (courseId) {
            const course = await Course.findById(courseId);
            if (!course) return res.status(404).json({ error: "Course not found" });
            if (course.facultyId.toString() !== req.user.userId) return res.status(403).json({ error: "Unauthorized for this course" });
            if (req.user.collegeId && course.collegeId && course.collegeId.toString() !== req.user.collegeId.toString()) return res.status(403).json({ error: "Course belongs to another college" });
        } else if (!targetDepartment) {
            return res.status(400).json({ error: "Must provide either courseId or Timetable Target (targetDepartment)" });
        }

        const newAssignment = new Assignment({
            collegeId: req.user.collegeId || undefined,
            courseId,
            batchId: batchId || undefined,
            targetDepartment,
            targetYear,
            targetSection,
            subjectName,
            title,
            description,
            language,
            starterCode,
            testCases,
            maxPoints: points,
            startTime,
            endTime
        });

        await newAssignment.save();

        // Broadcast to clients
        const io = req.app.get('io');
        if (io) {
            io.emit('assignment-created', {
                assignmentId: newAssignment._id,
                title: newAssignment.title,
                courseId: newAssignment.courseId,
                batchId: newAssignment.batchId
            });
        }

        res.json({ success: true, assignment: newAssignment });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Get Assignments for a Course
router.get('/course/:courseId', authenticate, async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ error: "Course not found" });
        // Scoping
        if (req.user.collegeId && course.collegeId && course.collegeId.toString() !== req.user.collegeId.toString()) {
            return res.status(403).json({ error: "Unauthorized access to this college's data" });
        }

        const assignments = await Assignment.find({ courseId: req.params.courseId }).sort({ createdAt: -1 });
        res.json(assignments);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 8.5 Get Cohort Assignments (For AssignmentManager UI)
router.get('/cohort-assignments', authenticate, async (req, res) => {
    try {
        const { targetDepartment, targetYear, targetSection, subjectName } = req.query;
        const assignments = await Assignment.find({
            targetDepartment,
            targetYear,
            targetSection,
            subjectName
        }).sort({ createdAt: -1 });
        res.json(assignments);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 9. Get Cohort Submissions
router.get('/cohort', authenticate, async (req, res) => {
    try {
        const { department, year, section, subjectName } = req.query;

        // 1. Find assignments matching cohort targeting
        const assignments = await Assignment.find({
            targetDepartment: department,
            targetYear: year,
            targetSection: section,
            subjectName: subjectName
        });
        const assignmentIds = assignments.map(a => a._id);

        // 2. Find all users matching this cohort
        const users = await User.find({
            department,
            year,
            section
        });
        const usernames = users.map(u => u.username);

        // 3. Get submissions and filter by users in this cohort
        const submissions = await Submission.find({
            assignmentId: { $in: assignmentIds },
            studentUsername: { $in: usernames }
        })
            .populate('assignmentId', 'title maxPoints')
            .sort({ submittedAt: -1 });

        res.json(submissions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 9.5 Get Submissions for a specific assignment
router.get('/:id/submissions', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'faculty') return res.status(403).json({ error: "Only faculty can view assignment submissions" });
        
        const submissions = await Submission.find({ assignmentId: req.params.id })
            .populate('assignmentId', 'title maxPoints')
            .sort({ submittedAt: -1 });

        res.json(submissions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Get Specific Assignment
router.get('/:id', authenticate, async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id).populate('courseId');
        if (!assignment) return res.status(404).json({ error: "Assignment not found" });

        // Scoping
        if (req.user.collegeId) {
            // If it's tied to a course, check the course's college
            if (assignment.courseId && assignment.courseId.collegeId && assignment.courseId.collegeId.toString() !== req.user.collegeId.toString()) {
                return res.status(403).json({ error: "Unauthorized access to this college's data" });
            }
            // If it's a cohort assignment, check the assignment's own collegeId
            if (!assignment.courseId && assignment.collegeId && assignment.collegeId.toString() !== req.user.collegeId.toString()) {
                return res.status(403).json({ error: "Unauthorized access to this college's data" });
            }
        }

        res.json(assignment);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Run Tests (Draft/Check)
router.post('/:id/run-tests', authenticate, async (req, res) => {
    try {
        const { code, language } = req.body;
        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) return res.status(404).json({ error: "Assignment not found" });

        // Run auto-grader
        const results = await runAutoGrader(code, language || assignment.language, assignment.testCases);

        // Hide hidden test cases from results if specific flag is set? 
        const sanitizedResults = results.map(r => {
            if (r.isHidden) return { ...r, input: 'Hidden', expected: 'Hidden', actual: r.pass ? 'Hidden' : 'Hidden', error: r.pass ? null : 'Failed Hidden Test' };
            return r;
        });

        res.json({ results: sanitizedResults });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. Submit Assignment
router.post('/:id/submit', authenticate, async (req, res) => {
    try {
        const { code, language } = req.body;
        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) return res.status(404).json({ error: "Assignment not found" });

        // Run auto-grader
        const results = await runAutoGrader(code, language || assignment.language, assignment.testCases);

        // Calculate Score
        let totalPoints = 0;
        let earnedPoints = 0;

        assignment.testCases.forEach((tc, index) => {
            totalPoints += tc.points;
            if (results[index] && results[index].pass) {
                earnedPoints += tc.points;
            }
        });

        // Create/Update Submission
        const customMax = assignment.maxPoints || 100;
        const scaledScore = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * customMax) : 0;

        const submission = await Submission.findOneAndUpdate(
            { assignmentId: assignment._id, studentUsername: req.user.username },
            {
                submittedCode: code,
                testResults: results.map((r, i) => ({
                    testCaseIndex: i,
                    pass: r.pass,
                    actualOutput: r.actual || '',
                    error: r.error || ''
                })),
                score: scaledScore,
                maxScore: customMax,
                status: 'submitted',
                submittedAt: new Date()
            },
            { new: true, upsert: true }
        );

        res.json({ success: true, submission, results });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7. Get Submissions for a specific student in a course
router.get('/course/:courseId/student/:username', authenticate, async (req, res) => {
    try {
        const assignments = await Assignment.find({ courseId: req.params.courseId });
        const assignmentIds = assignments.map(a => a._id);

        const submissions = await Submission.find({
            assignmentId: { $in: assignmentIds },
            studentUsername: req.params.username
        }).populate('assignmentId', 'title maxPoints');

        res.json(submissions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7.5 Get All Submissions for the logged-in student
router.get('/student/my-submissions', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'student') return res.status(403).json({ error: "Only students can view their global submissions" });
        const submissions = await Submission.find({
            studentUsername: req.user.username
        }).populate('assignmentId', 'title maxPoints');
        res.json(submissions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5.5 Update Assignment
router.put('/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'faculty') return res.status(403).json({ error: "Unauthorized" });
        
        const { title, description, language, starterCode, testCases, points, startTime, endTime, batchId, targetDepartment, targetYear, targetSection, subjectName } = req.body;
        
        const updated = await Assignment.findByIdAndUpdate(req.params.id, {
            title,
            description,
            language,
            starterCode,
            testCases,
            maxPoints: points,
            startTime,
            endTime,
            batchId: batchId || null,
            targetDepartment,
            targetYear,
            targetSection,
            subjectName
        }, { new: true });
        
        if (!updated) return res.status(404).json({ error: "Assignment not found" });
        res.json({ message: "Assignment updated successfully", assignment: updated });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 6. Get All Submissions for a Course (Gradebook)
router.get('/course/:courseId/submissions', authenticate, async (req, res) => {
    try {
        // 1. Get all assignments for this course
        const assignments = await Assignment.find({ courseId: req.params.courseId });
        const assignmentIds = assignments.map(a => a._id);

        // 2. Get all submissions for these assignments
        const submissions = await Submission.find({ assignmentId: { $in: assignmentIds } })
            .populate('assignmentId', 'title maxPoints') // Populate assignment details
            .sort({ submittedAt: -1 });

        res.json(submissions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 8. Get all assignments for all courses a student is enrolled in (for Student Dashboard)
router.get('/student/active', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'student') return res.status(403).json({ error: "Only students can view their active assignments globally" });
        // Find courses and batches student is enrolled in
        const user = await User.findById(req.user.userId);
        const enrolledBatches = user.enrolledBatches || [];

        const courses = await Course.find({ enrolledStudents: req.user.username });
        const courseIds = courses.map(c => c._id);

        // Find assignments for those courses, restricted by batch if applicable
        const conditions = [
            {
                courseId: { $in: courseIds },
                $or: [
                    { batchId: null },
                    { batchId: { $exists: false } },
                    { batchId: { $in: enrolledBatches } }
                ]
            }
        ];

        if (user.department && user.year && user.section) {
            conditions.push({
                targetDepartment: user.department,
                targetYear: user.year,
                targetSection: user.section
            });
        }

        const assignments = await Assignment.find({ $or: conditions })
            .populate('courseId', 'name')
            .sort({ endTime: 1 }); // Sort by end time (closest first)

        // Note: We return ALL assignments (unsubmitted and submitted) 
        // so the frontend can display them in History or mark them as "SUBMITTED"
        res.json(assignments);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
module.exports = router;
