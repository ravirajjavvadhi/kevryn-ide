const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
const { getProjectFileTree } = require('./routes/ai'); // Wait, routes export router, not function
const groqService = require('./services/groqService');
const File = require('./File');

// Mock getProjectFileTree since it's not exported
async function mockGetProjectFileTree(userId) {
    try {
        const files = await File.find({ owner: userId }).select('name type parentId');
        const childrenMap = {};
        files.forEach(f => {
            const pid = f.parentId || 'root';
            if (!childrenMap[pid]) childrenMap[pid] = [];
            childrenMap[pid].push(f);
        });

        let output = "";
        const traverse = (parentId, depth = 0) => {
            const children = childrenMap[parentId] || [];
            children.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'folder' ? -1 : 1;
            });

            for (const child of children) {
                const prefix = "  ".repeat(depth);
                const indicator = child.type === 'folder' ? '/' : '';
                output += `${prefix}${child.name}${indicator}\n`;
                if (child.type === 'folder') {
                    traverse(child._id.toString(), depth + 1);
                }
            }
        };
        traverse('root');
        return output;
    } catch (e) {
        console.error("Context Error:", e);
        return "";
    }
}

(async () => {
    try {
        await mongoose.connect('mongodb+srv://ravirajjavvadi:ravirajjavvadi@cluster0.engk55k.mongodb.net/ide_db?retryWrites=true&w=majority');

        const userId = '69897280670d7c27e13c0580';
        console.log("Fetching context for user:", userId);

        const files = await File.find({ owner: userId });
        const fileTree = await mockGetProjectFileTree(userId);

        console.log("\n--- FILE TREE ---\n", fileTree);

        const projectContext = files.map(f => ({
            name: f.name,
            content: f.content?.substring(0, 1000) // Cap content
        })).filter(f => !f.name.match(/\.(png|jpg|jpeg|gif|ico|pdf|zip|mp4)$/i));

        const fullContext = `Project Directory Structure:\n${fileTree}\n\nFile Contents:\n${JSON.stringify(projectContext)}`;

        console.log("\n--- FULL CONTEXT LEN ---\n", fullContext.length);

        const prompt = "Why can't I cd into frontend?";
        console.log("\n--- SENDING PROMPT ---\n", prompt);

        const plan = await groqService.generateImplementationPlan(prompt, fullContext);
        console.log("\n--- PLAN RESULT ---\n", JSON.stringify(plan, null, 2));

    } catch (error) {
        console.error("ERROR:", error);
    } finally {
        await mongoose.disconnect();
    }
})();
