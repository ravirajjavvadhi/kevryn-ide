const mongoose = require('mongoose');
const FileHistory = require('./FileHistory');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kevryn');
    const File = require('./File');
    const User = require('./User');

    const count = await FileHistory.countDocuments();
    console.log(`Total history records: ${count}`);

    const history = await FileHistory.find().populate('fileId');
    const grouped = {};
    history.forEach(h => {
        const name = h.fileId ? h.fileId.name : 'Unknown';
        if (!grouped[name]) grouped[name] = 0;
        grouped[name]++;
    });

    console.log('History counts by file:');
    console.log(JSON.stringify(grouped, null, 2));

    const latest = await FileHistory.find().sort({ savedAt: -1 }).limit(3).populate('fileId');
    console.log('Latest 3 records:');
    latest.forEach(l => {
        console.log(`- File: ${l.fileId?.name}, SavedAt: ${l.savedAt}, Content snippet: ${l.content.substring(0, 30)}...`);
    });

    process.exit(0);
}
check();
