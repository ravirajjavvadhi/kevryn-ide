const mongoose = require('mongoose');

const IssueSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional: who reported it
    username: { type: String }, // Snapshot of username
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: { type: String, enum: ['open', 'in-progress', 'resolved'], default: 'open' },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date }
});

module.exports = mongoose.model('Issue', IssueSchema);
