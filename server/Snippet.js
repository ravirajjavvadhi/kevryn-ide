const mongoose = require('mongoose');

const SnippetSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    code: { type: String, required: true },
    language: { type: String, default: 'javascript' },
    tags: [{ type: String }],
    description: { type: String, default: '' }
}, { timestamps: true });

// Index for faster search
SnippetSchema.index({ userId: 1, title: 'text', description: 'text' });

module.exports = mongoose.model('Snippet', SnippetSchema);
