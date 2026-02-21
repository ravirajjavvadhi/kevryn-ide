const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const File = require('./File');
const User = require('./User');
const FileHistory = require('./FileHistory');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_123';

async function verify() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kevryn');

    // 1. Get a user
    const user = await User.findOne({ username: 'ravirajjavvadi' });
    if (!user) {
        console.log('User ravirajjavvadi not found');
        process.exit(1);
    }
    console.log('User found:', user.username, user._id);

    // 2. Get the main.jsx file
    const file = await File.findOne({ name: 'main.jsx', owner: user._id });
    if (!file) {
        console.log('file main.jsx not found for user');
        process.exit(1);
    }
    console.log('File found:', file.name, file._id);

    // 3. Clear old history for this file to start fresh
    await FileHistory.deleteMany({ fileId: file._id });
    console.log('Cleared old history for this file.');

    // 4. Simulate a save (PUT /files/:id)
    // First save
    const content1 = file.content + '\n// Snapshot 1';
    console.log('Simulating first save...');
    await simulateSave(file._id, content1, user);

    // Second save
    const content2 = content1 + '\n// Snapshot 2';
    console.log('Simulating second save...');
    await simulateSave(file._id, content2, user);

    // 5. Check history
    const history = await FileHistory.find({ fileId: file._id }).sort({ savedAt: -1 });
    console.log(`History count for ${file.name}: ${history.length}`);
    history.forEach((h, i) => {
        console.log(`[${i}] Saved at: ${h.savedAt}, Content length: ${h.content.length}`);
    });

    if (history.length === 2) {
        console.log('✅ VERIFICATION SUCCESS: 2 snapshots recorded.');
    } else {
        console.log('❌ VERIFICATION FAILED: Snapshots not recorded correctly.');
    }

    process.exit(0);
}

async function simulateSave(fileId, content, user) {
    // This replicates the logic in app.put('/files/:id') in index.js
    const latestHistory = await FileHistory.findOne({ fileId: fileId }).sort({ savedAt: -1 });
    if (!latestHistory || latestHistory.content !== content) {
        const history = new FileHistory({
            fileId: fileId,
            content: content,
            savedBy: user._id
        });
        await history.save();
    }
    await File.findByIdAndUpdate(fileId, { content: content });
}

verify();
