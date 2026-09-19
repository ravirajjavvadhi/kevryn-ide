const mongoose = require('mongoose');

// Report-only mirror of the files a student touched in one supervised lab.
// It is deliberately separate from File (the personal/general workspace), so
// a faculty session report can never reveal unrelated student files.
const LabSessionArtifactSchema = new mongoose.Schema({
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabSession', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    courseName: { type: String, default: '' },
    files: [{
        path: { type: String, required: true },
        language: { type: String, default: 'plaintext' },
        code: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
        deletedAt: { type: Date, default: null },
        // Copy provenance is report metadata only. It never links the current
        // file to a mutable prior file or exposes any personal workspace path.
        importedFrom: {
            sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabSession' },
            path: String,
            importedAt: Date
        }
    }],
    lastSyncedAt: { type: Date, default: Date.now }
}, { timestamps: true });

LabSessionArtifactSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
LabSessionArtifactSchema.index({ collegeId: 1, courseId: 1, studentId: 1 });

module.exports = mongoose.model('LabSessionArtifact', LabSessionArtifactSchema);
