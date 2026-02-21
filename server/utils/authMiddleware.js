const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Access denied" });
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET || 'my_super_secret_key_123');
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ error: "Invalid token" });
    }
};

const authenticate = verifyToken;

module.exports = { authenticate, verifyToken };
