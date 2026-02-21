const mongoose = require('mongoose');
const User = require('./User');
const LabSession = require('./LabSessionModel');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to DB");

        const raj2 = await User.findOne({ username: 'raj2' });
        console.log("User raj2 found:", raj2 ? "YES" : "NO");
        if (raj2) console.log("raj2 Role:", raj2.role);

        const sessions = await LabSession.find({ isActive: true });
        console.log(`Active Sessions: ${sessions.length}`);

        sessions.forEach(s => {
            console.log(`Session ${s._id}: ${s.sessionName}`);
            console.log(`Allowed Students (${s.allowedStudents.length}):`, s.allowedStudents);
            const isAllowed = s.allowedStudents.includes('raj2');
            console.log(`Is raj2 allowed? ${isAllowed ? "YES" : "NO"}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
};

run();
