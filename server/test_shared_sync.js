const mongoose = require('mongoose');
require('dotenv').config();
const File = require('./File');

async function testSync() {
    await mongoose.connect(process.env.MONGODB_URI);

    const userId = '698f1dd8f2f71092b2641f18'; // DOUBTS CLARIFICATION
    const username = 'DOUBTS CLARIFICATION';

    console.log(`Checking files for user ${username} (${userId})...`);

    const query = {
        $or: [{ owner: userId }, { sharedWith: username }]
    };
    // Simulate non-lab context
    query.courseId = { $exists: false };

    const dbFiles = await File.find(query);
    console.log(`Found ${dbFiles.length} files.`);

    if (dbFiles.length > 0) {
        const jrtech = dbFiles.find(f => f.name.includes('jrtech'));
        console.log('jrtech found in query:', !!jrtech);

        const indexHtml = dbFiles.find(f => f.name === 'index.html');
        console.log('index.html found in query:', !!indexHtml);

        if (indexHtml) {
            console.log('index.html owner:', indexHtml.owner);
        }
    } else {
        console.log('No files found with updated query.');
    }

    process.exit(0);
}

testSync().catch(err => {
    console.error(err);
    process.exit(1);
});
