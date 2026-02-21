const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

// This automatically creates the "messages" collection in MongoDB
module.exports = mongoose.model('Message', MessageSchema);