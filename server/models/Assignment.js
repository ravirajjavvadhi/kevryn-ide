const mongoose = require('mongoose');

const AssignmentSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true }, // "Lab 1: Hello World"
    description: { type: String }, // Markdown supported

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
    dueDate: { type: Date },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Assignment', AssignmentSchema);
