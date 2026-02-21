const axios = require('axios');
const mongoose = require('mongoose');
const User = require('../User');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const testAnalytics = async () => {
    try {
        // 1. connect directly to DB to verify raw counts
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kevryn-ide');
        console.log("Connected to DB.");

        const totalUsers = await User.countDocuments();
        const usersByRole = await User.aggregate([
            { $group: { _id: "$role", count: { $sum: 1 } } }
        ]);
        console.log("RAW DB COUNTS:");
        console.log("Total Users:", totalUsers);
        console.log("By Role:", usersByRole);

        // 2. Simulate the aggregation used in admin.js
        const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        console.log("Looking for users since:", last7Days);

        // Try simple ID match first
        const recentById = await User.countDocuments({
            _id: { $gte: mongoose.Types.ObjectId.createFromTime(last7Days.getTime() / 1000) }
        });
        console.log("Recent by ID:", recentById);

        // Try the exact aggregation from admin.js
        const trend = await User.aggregate([
            {
                $project: {
                    createdAt: { $ifNull: ["$createdAt", { $toDate: "$_id" }] }
                }
            },
            { $match: { createdAt: { $gte: last7Days } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        console.log("Aggregation Trend Result:", trend);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

testAnalytics();
