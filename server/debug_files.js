const mongoose = require('mongoose');
require('dotenv').config();
const File = require('./File');
const User = require('./User');

const MONGO_URI = process.env.MONGODB_URI;
const targetUserId = '698ac20ea5e18032a9e9edb0';

async function getFileRelativePath(fileId) {
    if (!fileId || fileId === 'root') return "";
    try {
        const file = await File.findById(fileId);
        if (!file) return "";
        const parentPath = await getFileRelativePath(file.parentId);
        return require('path').join(parentPath, file.name);
    } catch (e) { return ""; }
}

async function debug() {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const userFiles = await File.find({ owner: targetUserId });
    console.log(`Found ${userFiles.length} files for user ${targetUserId}`);

    for (const f of userFiles) {
        const fullPath = await getFileRelativePath(f._id);
        console.log(`[FILE] ID: ${f._id} | Name: ${f.name} | Path: ${fullPath} | Type: ${f.type}`);
    }

    mongoose.connection.close();
}

debug();
