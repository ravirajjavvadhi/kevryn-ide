const mongoose = require('mongoose');
const File = require('./File');
const User = require('./User');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kevryn');

    const id1 = '69897280670d7c27e13c0580';
    const id2 = '698974cb937390819c75593a';

    const user1 = await User.findById(id1);
    const user2 = await User.findById(id2);

    console.log(`User 1 (${id1}):`, user1 ? user1.username : 'NOT FOUND');
    console.log(`User 2 (${id2}):`, user2 ? user2.username : 'NOT FOUND');

    const count1 = await File.countDocuments({ owner: id1 });
    const count2 = await File.countDocuments({ owner: id2 });

    console.log(`File count for User 1: ${count1}`);
    console.log(`File count for User 2: ${count2}`);

    process.exit(0);
}
check();
