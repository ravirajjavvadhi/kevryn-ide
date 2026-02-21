const mongoose = require('mongoose');
const path = require('path');
const User = require('../User');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const username = process.argv[2];
const email = process.argv[3];

if (!username || !email) {
    console.error("Usage: node set_email.js <username> <email>");
    process.exit(1);
}

const setEmail = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kevryn-ide');
        const user = await User.findOne({ username });
        if (!user) {
            console.error(`User ${username} not found.`);
            process.exit(1);
        }
        user.email = email;
        await user.save();
        console.log(`SUCCESS: Updated ${user.username}'s email to ${email}`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

setEmail();
