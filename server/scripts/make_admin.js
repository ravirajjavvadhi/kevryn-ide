const mongoose = require('mongoose');
const path = require('path');
const User = require('../User');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Load env from server root

const identifier = process.argv[2];

if (!identifier) {
    console.error("Please provide an email or username as an argument.");
    process.exit(1);
}

const promoteToAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kevryn-ide');
        console.log("Connected to MongoDB.");

        const user = await User.findOne({
            $or: [{ email: identifier }, { username: identifier }]
        });

        if (!user) {
            console.error(`User '${identifier}' not found.`);
            const allUsers = await User.find({}, 'email username');
            console.log("Available users:", allUsers.map(u => `${u.username} (${u.email})`).join(', '));
            process.exit(1);
        }

        user.role = 'admin';
        // If the identifier looks like an email and the user has no email, update it
        if (identifier.includes('@') && !user.email) {
            user.email = identifier;
            console.log(`Updated email for ${user.username} to ${identifier}`);
        }

        await user.save();
        console.log(`SUCCESS: User ${user.username} (${user.email}) is now an ADMIN.`);
        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
};

promoteToAdmin();
