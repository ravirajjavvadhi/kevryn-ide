const mongoose = require('mongoose');

const ManagementActionAuditSchema = new mongoose.Schema({
    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: 'College' },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    status: { type: String, enum: ['completed', 'partial', 'rejected'], required: true },
    summary: { type: String, required: true },
    affectedCount: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now }
});

ManagementActionAuditSchema.index({ collegeId: 1, createdAt: -1 });
module.exports = mongoose.model('ManagementActionAudit', ManagementActionAuditSchema);
