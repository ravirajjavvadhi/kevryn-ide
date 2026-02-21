const mongoose = require('mongoose');
const User = require('../User');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const checkDates = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kevryn-ide');
        console.log("Connected.");

        const count = await User.countDocuments();
        console.log(`Total Users: ${count}`);

        const users = await User.find({}, '_id username createdAt').limit(5);
        users.forEach(u => {
            console.log(`User: ${u.username}`);
            console.log(`  _id timestamp: ${u._id.getTimestamp()}`);
            console.log(`  createdAt: ${u.createdAt}`);
        });

        const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recent = await User.countDocuments({
            _id: { $gte: mongoose.Types.ObjectId.createFromTime(last7Days.getTime() / 1000) }
        });
        console.log(`Users created in last 7 days (by _id): ${recent}`);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

checkDates();
