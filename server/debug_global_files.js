const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./User'); // Register User schema
const File = require('./File'); // Register File schema

const MONGO_URI = process.env.MONGODB_URI;

async function debug() {
    await mongoose.connect(MONGO_URI);
    const files = await File.find({ name: { $in: ['index.html', 'hello.js'] } }).populate('owner');
    console.log(`Found ${files.length} target files globally:`);
    files.forEach(f => {
        const ownerId = f.owner?._id || f.owner;
        console.log(`- ${f.name} (ID: ${f._id}) | Owner: ${ownerId} | Content Len: ${f.content?.length || 0}`);
    });
    mongoose.connection.close();
}

debug();
