const mongoose = require('mongoose');
const File = require('./File');
const User = require('./User');
require('dotenv').config();

async function debug() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kevryn');

    const user = await User.findOne({ username: 'ravirajjavvadi' });
    if (!user) {
        console.log('User ravirajjavvadi not found');
        process.exit(1);
    }
    console.log('User ID (ObjectId):', user._id);
    console.log('User ID (String):', user._id.toString());

    const files = await File.find({ owner: user._id });
    console.log(`Files owned by ObjectId: ${files.length}`);

    const filesStr = await File.find({ owner: user._id.toString() });
    console.log(`Files owned by String: ${filesStr.length}`);

    if (files.length > 0) {
        const testFile = files[0];
        console.log(`Testing permission check for file ${testFile._id}...`);

        // Simulating index.js logic
        const userIdStr = user._id.toString();
        const found = await File.findOne({
            _id: testFile._id,
            $or: [
                { owner: userIdStr },
                { sharedWith: user.username }
            ]
        });

        if (found) {
            console.log('✅ Permission check PASSED with string ID.');
        } else {
            console.log('❌ Permission check FAILED with string ID.');

            // Try with ObjectId
            const foundObj = await File.findOne({
                _id: testFile._id,
                $or: [
                    { owner: user._id },
                    { sharedWith: user.username }
                ]
            });
            if (foundObj) {
                console.log('✅ Permission check PASSED with ObjectId.');
                console.log('CONCLUSION: Mongoose is NOT casting string ID accurately inside the $or block for the "owner" field.');
            }
        }
    }

    process.exit(0);
}
debug();
