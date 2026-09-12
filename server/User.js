const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String, trim: true, default: '' },
  email: { type: String, unique: true, sparse: true }, // For Google Auth
  password: { type: String }, // Optional for Google users
  picture: { type: String }, // URL to profile picture
  googleId: { type: String, unique: true, sparse: true },
  githubId: { type: String, unique: true, sparse: true },
  githubToken: { type: String },
  githubUsername: { type: String },
  
  // Advanced Developer Tracking Usernames
  externalProfiles: {
    github: { type: String, default: '' },
    leetcode: { type: String, default: '' },
    hackerrank: { type: String, default: '' },
    codechef: { type: String, default: '' }
  },
  // New field to remember who you are working with
  collaborators: [{ type: String }],
  // Multi-College Tenancy: Permanent college binding (Default to ACEEN-A5EC for students)
  collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
  collegeCode: { type: String }, // NEW: Store hardcoded college code 'ACEEN-A5EC' for reference
  
  // KevRyn Lab Monitor Role
  role: { type: String, enum: ['student', 'faculty', 'admin', 'user', 'college_admin'], default: 'student' },
  isFacultyActive: { type: Boolean, default: false }, // Faculty approval status

  // Student Timetable & Section Targets
  rollNumber: { type: String, unique: true, sparse: true },
  department: { type: String }, // e.g., 'CSE'
  year: { type: String },       // e.g., '3'
  section: { type: String },    // e.g., 'D'
  isActiveStudent: { type: Boolean, default: true }, // For management soft-deactivation

  // Unified KevRyn Lab System: Link to Batches
  enrolledBatches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
