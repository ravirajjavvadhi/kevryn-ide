const mongoose = require('mongoose');

const LabSessionSchema = new mongoose.Schema({
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    sessionName: { type: String, required: true },
    subject: { type: String, default: 'General' },
    semester: { type: String, default: 'Sem 1' },
    startTime: { type: Date, default: Date.now },
    duration: { type: Number, default: 60 }, // NEW: in minutes
    endTime: { type: Date },
    isActive: { type: Boolean, default: true },


    // Whitelisted students for this session
    allowedStudents: [{ type: String }],

    // Real-time tracking of who is currently online in this session
    activeStudents: [{
        username: String,
        loginTime: Date,
        lastHeartbeat: Date,
        currentStatus: { type: String, enum: ['active', 'idle', 'offline', 'distracted'], default: 'active' },
        // NEW: Behavior tracking fields
        tabSwitchCount: { type: Number, default: 0 },
        pasteCount: { type: Number, default: 0 },
        attentionScore: { type: Number, default: 100 }, // 0-100
        keystrokeRate: { type: Number, default: 0 },    // keystrokes/min
        raiseHand: { type: Boolean, default: false }
    }],

    // Activity Log for post-session reports & timeline
    activityLog: [{
        username: String,
        event: {
            type: String,
            enum: ['login', 'logout', 'focus-lost', 'focus-gained', 'paste-detected', 'tab-switch', 'raise-hand', 'hand-acknowledged', 'announcement']
        },
        timestamp: { type: Date, default: Date.now },
        details: String
    }]
});

// PERFORMANCE: Indexes for the most frequent queries
LabSessionSchema.index({ isActive: 1, facultyId: 1 }); // Faculty active session lookup
LabSessionSchema.index({ isActive: 1, allowedStudents: 1 }); // Student session check
LabSessionSchema.index({ startTime: -1 }); // Sort by recent

module.exports = mongoose.model('LabSession', LabSessionSchema);
