const mongoose = require('mongoose');
require('dotenv').config();
const File = require('./File');

const MONGO_URI = process.env.MONGODB_URI;
const targetUserId = '698ac20ea5e18032a9e9edb0';

async function debug() {
    await mongoose.connect(MONGO_URI);
    const files = await File.find({ owner: targetUserId, name: { $in: ['index.html', 'hello.js'] } });
    console.log(`Found ${files.length} target files:`);
    files.forEach(f => {
        console.log(`- ${f.name} (ID: ${f._id}) Content Len: ${f.content?.length || 0}`);
    });
    mongoose.connection.close();
}

debug();
