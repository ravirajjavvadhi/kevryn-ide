const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['file', 'folder'], required: true },
  parentId: { type: String, default: 'root' },
  content: { type: String, default: '' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // ADD THIS: List of usernames who can also see this file
  sharedWith: [{ type: String }],
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }, // NEW: Link to specific lab/course
  // Vayu Lab Monitor Tracking Fields
  keystrokes: { type: Number, default: 0 },
  pasteCount: { type: Number, default: 0 },
  activeTimeFull: { type: Number, default: 0 }, // Total minutes or seconds
  lastActivity: { type: Date, default: Date.now }
});

// PERFORMANCE: Indexes for frequent queries
FileSchema.index({ owner: 1, courseId: 1 }); // Main file list query
FileSchema.index({ owner: 1, name: 1 });     // Duplicate check
FileSchema.index({ parentId: 1 });            // Tree traversal

module.exports = mongoose.model('File', FileSchema);