const mongoose = require('mongoose');
require('dotenv').config();
const Course = require('./models/Course');
const Batch = require('./models/Batch');
const LabReport = require('./models/LabReport');
const User = require('./User'); // Check this path

const run = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!uri) throw new Error("MongoDB URI not found in env");
        await mongoose.connect(uri);
        console.log("Connected to DB");

        const courseName = "Python";
        console.log(`[TEST] Fetching reports for course: '${courseName}'`);

        const course = await Course.findOne({ name: courseName });
        let enrolledStudents = [];

        if (course) {
            console.log(`[TEST] Course found: ${course._id}`);
            const batches = await Batch.find({ courseId: course._id });
            console.log(`[TEST] Batches found: ${batches.length}`);

            batches.forEach(b => {
                console.log(`[TEST] Batch ${b.name} has ${b.students.length} students`);
                b.students.forEach(s => {
                    if (!enrolledStudents.find(e => e.username === s.username)) {
                        enrolledStudents.push({
                            username: s.username,
                            email: s.email,
                            picture: null
                        });
                    }
                });
            });
        } else {
            console.log(`[TEST] Course NOT found for name: '${courseName}'`);
        }

        console.log(`[TEST] Enrolled students list: ${JSON.stringify(enrolledStudents)}`);

        // Get Existing Reports
        const reports = await LabReport.find({ courseName: courseName });
        console.log(`[TEST] Existing reports found: ${reports.length}`);

        const mergedReports = await Promise.all(enrolledStudents.map(async (student) => {
            const existingReport = reports.find(r => r.studentId?.username === student.username); // Note: existingReport.studentId is ObjectId usually, unless populated?
            // Wait! In server/index.js we used .populate('studentId')
            // So r.studentId is an OBJECT. r.studentId.username is correct.
            // HERE we didn't populate.

            // Let's populate to match server logic
            return {
                username: student.username,
                hasReport: !!existingReport
            };
        }));

        console.log(`[TEST] Merged Results:`, mergedReports);

    } catch (e) {
        console.error(e);
    } finally {
        mongoose.connection.close();
    }
};

run();
