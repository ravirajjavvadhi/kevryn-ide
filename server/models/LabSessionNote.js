const mongoose = require('mongoose');

// Notes are scoped to one supervised session. They are intentionally kept
// separate from announcements so students can reopen them without changing
// the transient announcement banner or exposing notes in another session.
const LabSessionNoteSchema = new mongoose.Schema({
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabSession', required: true, index: true },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, trim: true, maxlength: 140, default: '' },
    message: { type: String, required: true, trim: true, maxlength: 4000 }
}, { timestamps: true });

LabSessionNoteSchema.index({ sessionId: 1, createdAt: -1 });

module.exports = mongoose.model('LabSessionNote', LabSessionNoteSchema);
