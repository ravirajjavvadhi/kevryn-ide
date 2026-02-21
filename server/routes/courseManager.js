const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const Batch = require('../models/Batch');
const User = require('../User');
const { authenticate } = require('../utils/authMiddleware'); // Assume auth middleware exists or will be moved

// --- COURSE MANAGEMENT ---

// 1. Create a New Course
router.post('/courses', authenticate, async (req, res) => {
    try {
        const { name, code, semester, description } = req.body;

        const newCourse = new Course({
            facultyId: req.user.userId,
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
        const courses = await Course.find({ facultyId: req.user.userId })
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
        const course = await Course.findById(req.params.id).populate('batches');
        if (!course) return res.status(404).json({ error: "Course not found" });
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
        const { name, schedule } = req.body;
        const course = await Course.findById(req.params.id);

        if (!course) return res.status(404).json({ error: "Course not found" });
        if (course.facultyId.toString() !== req.user.userId) return res.status(403).json({ error: "Unauthorized" });

        const newBatch = new Batch({
            courseId: course._id,
            name,
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
                coursesMap.set(batch.courseId._id.toString(), batch.courseId);
            }
        });

        res.json(Array.from(coursesMap.values()));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
