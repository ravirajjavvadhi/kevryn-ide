const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema({
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }, // Optional now
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }, // Optional

    // NEW: Global Timetable Targeting
    targetDepartment: { type: String }, // e.g. 'CSE'
    targetYear: { type: String },       // e.g. '3'
    targetSection: { type: String },    // e.g. 'D'
    subjectName: { type: String },      // e.g. 'C LAB'

    title: { type: String, required: true }, // "Lab 1: Hello World"
    description: { type: String }, // Markdown supported
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },

    // Code Execution Config
    language: { type: String, default: 'python' }, // python, javascript, c, cpp
    starterCode: { type: String, default: '' }, // Template code provided to student

    // Auto-Grading Test Cases
    testCases: [{
        input: String,
        expectedOutput: String,
        isHidden: { type: Boolean, default: false }, // Hidden from students?
        points: { type: Number, default: 10 }
    }],

    maxPoints: { type: Number, default: 100 },
    startTime: { type: Date },
    endTime: { type: Date },

    createdAt: { type: Date, default: Date.now }
});

// PERFORMANCE: Indexes for fast scoping
AssignmentSchema.index({ courseId: 1 });
AssignmentSchema.index({ collegeId: 1 });
AssignmentSchema.index({ collegeId: 1, targetDepartment: 1, targetYear: 1, targetSection: 1, endTime: 1 });

module.exports = mongoose.model('Assignment', AssignmentSchema);
