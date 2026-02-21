const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const File = require('./File');
require('dotenv').config();

const USER_ID = '698974cb937390819c75593a';
const BASE_USER_DIR = path.join(__dirname, 'user_projects');
const MONGODB_URI = process.env.MONGODB_URI;

async function syncDbToDisk() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("🚀 Connected to MongoDB");

        const userDir = path.join(BASE_USER_DIR, USER_ID);
        if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

        const files = await File.find({ owner: USER_ID });
        console.log(`Found ${files.length} files/folders in DB for user ${USER_ID}`);

        const fileMap = {};
        files.forEach(f => fileMap[f._id.toString()] = f);

        async function getPath(fileId) {
            if (!fileId || fileId === 'root') return "";
            const file = fileMap[fileId];
            if (!file) return "";
            const parentPath = await getPath(file.parentId);
            return path.join(parentPath, file.name);
        }

        for (const file of files) {
            const relPath = await getPath(file._id.toString());
            const fullPath = path.join(userDir, relPath);

            if (file.type === 'folder') {
                if (!fs.existsSync(fullPath)) {
                    fs.mkdirSync(fullPath, { recursive: true });
                    console.log(`Created directory: ${relPath}`);
                }
            } else {
                const dir = path.dirname(fullPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                fs.writeFileSync(fullPath, file.content || "");
                console.log(`Synced file: ${relPath}`);
            }
        }

        console.log("✅ Sync Complete!");
    } catch (err) {
        console.error("❌ Sync Failed:", err);
    } finally {
        await mongoose.disconnect();
    }
}

syncDbToDisk();
