require('dotenv').config();
const mongoose = require('mongoose');
const LabSession = require('./LabSessionModel');
const Batch = require('./models/Batch');
const Course = require('./models/Course');

const MONGO_URI = process.env.MONGODB_URI;

async function diagnose() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        const latestSession = await LabSession.findOne().sort({ startTime: -1 });
        console.log("\n--- Latest Lab Session (RAW) ---");
        if (latestSession) {
            console.log(latestSession);
        }

        const batches = await Batch.find();
        console.log("\n--- All Batches (RAW) ---");
        batches.forEach(b => {
            console.log(`Batch: ${b.name}`);
            console.log(JSON.stringify(b, null, 2));
        });

        await mongoose.disconnect();
    } catch (e) {
        console.error("Diagnosis failed:", e);
    }
}

diagnose();
