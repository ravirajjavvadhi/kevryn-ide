const mongoose = require('mongoose');
const User = require('./User');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kevryn');
    const users = await User.find();
    console.log('Total users:', users.length);
    users.forEach(u => {
        console.log(`- Username: ${u.username}, ID: ${u._id}, Email: ${u.email || 'N/A'}`);
    });
    process.exit(0);
}
check();
