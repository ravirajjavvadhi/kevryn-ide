const mongoose = require('mongoose');
const crypto = require('crypto');

const CollegeSchema = new mongoose.Schema({
    name: { type: String, required: true },                       // "JNTU Hyderabad"
    code: { type: String, required: true, unique: true },         // "JNTUH-7K9P" (auto-generated)
    inviteToken: { type: String, unique: true },                  // UUID for shareable invite link
    logo: { type: String },                                       // URL to college logo
    address: { type: String },
    contactEmail: { type: String },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// --- AUTO-GENERATE code and inviteToken before saving ---
CollegeSchema.pre('validate', function (next) {
    if (!this.code) {
        // Take first 5 uppercase letters from the name (strip spaces/special chars)
        const prefix = this.name.replace(/[^a-zA-Z]/g, '').substring(0, 5).toUpperCase();
        // Append 4 random alphanumeric chars
        const suffix = crypto.randomBytes(2).toString('hex').toUpperCase(); // 4 hex chars
        this.code = `${prefix}-${suffix}`;
    }
    if (!this.inviteToken) {
        this.inviteToken = crypto.randomUUID();
    }
    next();
});

// Index for fast code lookups during join
CollegeSchema.index({ code: 1 });
CollegeSchema.index({ inviteToken: 1 });

module.exports = mongoose.model('College', CollegeSchema);
