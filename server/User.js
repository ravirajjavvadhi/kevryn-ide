const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, unique: true, sparse: true }, // For Google Auth
  password: { type: String }, // Optional for Google users
  picture: { type: String }, // URL to profile picture
  googleId: { type: String, unique: true, sparse: true },
  githubId: { type: String, unique: true, sparse: true },
  githubToken: { type: String },
  githubUsername: { type: String },
  // New field to remember who you are working with
  collaborators: [{ type: String }],
  // Multi-College Tenancy: Permanent college binding
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
  // Vayu Lab Monitor Role
  role: { type: String, enum: ['student', 'faculty', 'admin', 'user'], default: 'student' },
  isFacultyActive: { type: Boolean, default: false }, // Faculty approval status

  // Unified Vayu Lab System: Link to Batches
  enrolledBatches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);