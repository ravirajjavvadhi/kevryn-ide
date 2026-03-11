const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true }, // e.g., "Python Programming"
    code: { type: String, required: true }, // e.g., "CS101"
    semester: { type: String, default: 'Sem 1' },
    description: { type: String, default: '' },

    // Batches belonging to this course
    batches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],

    // Whitelisted students for this course
    enrolledStudents: [{ type: String }], // Array of usernames

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Course', CourseSchema);
