const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kevryn');
    const File = require('./File');
    const FileHistory = require('./FileHistory');

    const files = await File.find({ name: 'main.jsx' });
    console.log(`Found ${files.length} files named "main.jsx":`);
    for (const f of files) {
        const hCount = await FileHistory.countDocuments({ fileId: f._id });
        console.log(`- ID: ${f._id}, Owner: ${f.owner}, SharedWith: ${f.sharedWith}, History Count: ${hCount}`);
    }

    process.exit(0);
}
check();
