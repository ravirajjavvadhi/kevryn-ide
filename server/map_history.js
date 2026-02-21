const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kevryn');
    const File = require('./File');
    const FileHistory = require('./FileHistory');

    const histories = await FileHistory.find().populate('fileId');
    console.log(`Found ${histories.length} history records.`);

    const fileMap = {};
    for (const h of histories) {
        const fileId = h.fileId ? h.fileId._id.toString() : 'Unknown';
        const fileName = h.fileId ? h.fileId.name : 'Unknown';
        if (!fileMap[fileId]) fileMap[fileId] = { name: fileName, count: 0 };
        fileMap[fileId].count++;
    }

    console.log('History distribution by file ID:');
    console.log(JSON.stringify(fileMap, null, 2));

    process.exit(0);
}
check();
