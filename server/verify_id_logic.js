const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();
// We can't easily use Axios to hit the running server if auth is required and we don't have a token.
// But we can simulate the DB call logic using the same code I wrote in test_report_logic.js, 
// but adapting it to the NEW logic (findById).

const Course = require('./models/Course');
const Batch = require('./models/Batch');
const LabReport = require('./models/LabReport');

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        await mongoose.connect(uri);
        console.log("Connected to DB");

        const courseId = "6991f01dd2b34fbefccc59a2"; // From previous debug output
        console.log(`[TEST] Fetching reports for courseId: '${courseId}'`);

        // 1. Get Course by ID
        const course = await Course.findById(courseId);

        if (course) {
            console.log(`[TEST] Course found: ${course.name}`);
            const batches = await Batch.find({ courseId: course._id });
            console.log(`[TEST] Batches found: ${batches.length}`);

            let enrolledStudents = [];
            batches.forEach(b => {
                b.students.forEach(s => {
                    if (!enrolledStudents.find(e => e.username === s.username)) {
                        enrolledStudents.push(s.username);
                    }
                });
            });
            console.log(`[TEST] Enrolled: ${enrolledStudents.join(', ')}`);
        } else {
            console.log(`[TEST] Course NOT found!`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        mongoose.connection.close();
    }
};

run();
