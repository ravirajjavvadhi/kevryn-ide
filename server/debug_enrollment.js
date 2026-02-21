const mongoose = require('mongoose');
require('dotenv').config();
const Course = require('./models/Course');
const Batch = require('./models/Batch');
const User = require('./User');

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!uri) throw new Error("MongoDB URI not found in env");
        await mongoose.connect(uri);
        console.log("Connected to DB");

        console.log("\n--- VERIFICATION ---");
        const raj2 = await User.findOne({ username: 'raj2' });
        if (!raj2) {
            console.log("CRITICAL: raj2 not found!");
            return;
        }
        console.log(`User 'raj2' found. ID: ${raj2._id}`);
        console.log(`User's enrolledBatches: ${raj2.enrolledBatches}`);

        const courses = await Course.find({ name: "Python" });
        if (courses.length === 0) console.log("CRITICAL: No 'Python' course found!");

        for (const c of courses) {
            console.log(`\nChecking Course: ${c.name} (Code: ${c.code}, ID: ${c._id})`);
            const batches = await Batch.find({ courseId: c._id });

            let foundInBatch = false;
            for (const b of batches) {
                // Check if student ID is in batch.students array? 
                // Wait, Batch model stores objects { username: String, ... }
                const studentEntry = b.students.find(s => s.username === 'raj2');
                const isEnrolled = !!studentEntry;
                console.log(`  Batch '${b.name}' (${b._id}): raj2 enrolled? ${isEnrolled}`);
                if (isEnrolled) foundInBatch = true;
            }
            console.log(`  -> RESULT: raj2 is ${foundInBatch ? 'ENROLLED' : 'NOT ENROLLED'} in this course.`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        mongoose.connection.close();
    }
};

run();
