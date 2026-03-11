const mongoose = require('mongoose');

const BatchSchema = new mongoose.Schema({
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    name: { type: String, required: true }, // e.g., "Batch A"

    // Students Enrolled in this Batch
    students: [{
        username: { type: String, required: true },
        email: String,
        enrollmentDate: { type: Date, default: Date.now }
    }],

    // Optional Schedule
    schedule: {
        day: { type: String }, // e.g., "Monday"
        time: { type: String } // e.g., "10:00 AM"
    },

    createdAt: { type: Date, default: Date.now }
});

// PERFORMANCE: Indexes for fast scoping
BatchSchema.index({ courseId: 1 });
BatchSchema.index({ collegeId: 1 });

module.exports = mongoose.model('Batch', BatchSchema);
