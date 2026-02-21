const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('./User');
require('dotenv').config();

const API_URL = 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_123';

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const user = await User.findOne({ username: 'raj2' });
        if (!user) { console.log("User raj2 not found"); return; }

        console.log("Generating token for raj2:", user._id);
        const token = jwt.sign(
            { userId: user._id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        console.log("Calling API...");
        const res = await axios.get(`${API_URL}/lab/student/active-session`, {
            headers: { Authorization: token }
        });

        console.log("API Response:", res.status);
        console.log("Session Data:", JSON.stringify(res.data, null, 2));

    } catch (e) {
        console.error("API Error:", e.message);
        if (e.response) console.error("Response Data:", e.response.data);
    } finally {
        mongoose.disconnect();
    }
};

run();
