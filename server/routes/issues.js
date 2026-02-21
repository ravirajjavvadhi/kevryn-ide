const express = require('express');
const router = express.Router();
const Issue = require('../models/Issue');
const { authenticate } = require('../utils/authMiddleware');

// Report an Issue (Public/Private)
router.post('/', authenticate, async (req, res) => {
    try {
        const { title, description, severity } = req.body;
        const issue = new Issue({
            title,
            description,
            user: req.user.userId,
            username: req.user.username,
            severity: severity || 'medium'
        });
        await issue.save();
        res.json({ success: true, message: "Issue reported successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
