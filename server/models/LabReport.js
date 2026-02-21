const mongoose = require('mongoose');

const LabReportSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    courseName: { type: String, required: true },

    // Track files and time spent
    files: [{
        fileName: { type: String, required: true },
        code: { type: String, default: "" },
        timeSpent: { type: Number, default: 0 },
        status: { type: String, enum: ['in-progress', 'submitted'], default: 'in-progress' },
        lastUpdated: { type: Date, default: Date.now }
    }],

    // NEW: Behavior Tracking Stats (Aggregated)
    tabSwitchCount: { type: Number, default: 0 },
    pasteCount: { type: Number, default: 0 },
    attentionScore: { type: Number, default: 100 },
    plagiarismSimilarity: { type: Number, default: 0 }, // 0-100%

    // Cumulative stats
    totalTimeSpent: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now }
});

LabReportSchema.index({ studentId: 1, courseName: 1 }, { unique: true });

module.exports = mongoose.model('LabReport', LabReportSchema);
