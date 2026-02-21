const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const File = require('./File');

// Configuration
const USER_ID = '69897280670d7c27e13c0580'; // The user we are fixing
const USER_PROJECTS_DIR = path.join(__dirname, 'user_projects');
const MONGO_URI = 'mongodb+srv://ravirajjavvadi:ravirajjavvadi@cluster0.engk55k.mongodb.net/ide_db?retryWrites=true&w=majority';

async function syncFiles() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        // 1. Clear existing files for this user to avoid duplicates (optional, but cleaner for a hard reset)
        // await File.deleteMany({ owner: USER_ID }); 
        // console.log("Cleared existing files");

        // Helper to find or create folder
        async function getOrCreateFolder(name, parentId) {
            let folder = await File.findOne({ name, type: 'folder', parentId, owner: USER_ID });
            if (!folder) {
                folder = new File({
                    name,
                    type: 'folder',
                    parentId,
                    owner: USER_ID,
                    content: ''
                });
                await folder.save();
                console.log(`Created folder: ${name}`);
            }
            return folder._id.toString();
        }

        // Recursive walker
        async function processDirectory(currentPath, parentId) {
            const items = fs.readdirSync(currentPath);

            for (const item of items) {
                if (['node_modules', '.git', 'dist', 'build'].includes(item)) continue; // Skip heavy folders

                const itemPath = path.join(currentPath, item);
                const stats = fs.statSync(itemPath);

                if (stats.isDirectory()) {
                    const folderId = await getOrCreateFolder(item, parentId);
                    await processDirectory(itemPath, folderId);
                } else {
                    // It's a file
                    // Check if exists
                    let file = await File.findOne({ name: item, type: 'file', parentId, owner: USER_ID });

                    let content = '';
                    try {
                        // Only read text files
                        if (!item.match(/\.(png|jpg|jpeg|gif|ico|pdf|zip|mp4|exe|dll|class)$/i)) {
                            content = fs.readFileSync(itemPath, 'utf8');
                        }
                    } catch (e) {
                        console.warn(`Skipping content for ${item}`);
                    }

                    if (!file) {
                        file = new File({
                            name: item,
                            type: 'file',
                            parentId,
                            owner: USER_ID,
                            content: content
                        });
                        await file.save();
                        console.log(`Created file: ${item}`);
                    } else {
                        // Update content if changed
                        if (file.content !== content) {
                            file.content = content;
                            await file.save();
                            console.log(`Updated file: ${item}`);
                        }
                    }
                }
            }
        }

        console.log(`Scanning ${USER_PROJECTS_DIR}...`);
        await processDirectory(USER_PROJECTS_DIR, 'root');

        console.log("Sync complete!");

    } catch (error) {
        console.error("Sync Error:", error);
    } finally {
        await mongoose.disconnect();
    }
}

syncFiles();
