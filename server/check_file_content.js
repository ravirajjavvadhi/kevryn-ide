const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: './.env' });

const FileSchema = new mongoose.Schema({
    name: String,
    type: String,
    parentId: String,
    content: String,
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sharedWith: [String]
});

const File = mongoose.model('File', FileSchema);

async function checkContent() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to DB");

        const files = await File.find({ name: 'index.html' });
        console.log(`Found ${files.length} index.html files`);

        files.forEach(f => {
            console.log(`\n--- File ID: ${f._id} ---`);
            console.log(`Owner: ${f.owner}`);
            console.log(`Content Length: ${f.content ? f.content.length : 0}`);
            console.log(`Content Preview: ${f.content ? f.content.substring(0, 100) : 'NULL'}`);
        });

        const allFiles = await File.find({});
        console.log(`\nTotal Files in DB: ${allFiles.length}`);

        mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
}

checkContent();
