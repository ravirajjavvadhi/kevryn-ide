const File = require('../File');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const path = require('path');
const fs = require('fs');
const os = require('os');

// Returns the Gemini SDK formatted tool declarations
const getOpenAIToolDeclarations = () => {
    const rawTools = [
        {
            name: "readFile",
            description: "Reads the contents of a file inside the user's workspace based on the fileName path. Use this to understand existing code before modifying.",
            parameters: {
                type: "object",
                properties: {
                    fileName: { type: "string", description: "The exact path or name of the file (e.g. client/src/App.js)." }
                },
                required: ["fileName"]
            }
        },
        {
            name: "writeFile",
            description: "Creates a new file or completely overwrites an existing file with new content. Use this to write code for the user.",
            parameters: {
                type: "object",
                properties: {
                    fileName: { type: "string", description: "The path or name of the file to create or update." },
                    content: { type: "string", description: "The full source code content to write." }
                },
                required: ["fileName", "content"]
            }
        },
        {
            name: "listFiles",
            description: "Lists all files and directories in the user's workspace. Use this to understand the project structure.",
            parameters: {
                type: "object",
                properties: {
                    searchQuery: { type: "string", description: "Optional filter string." }
                }
            }
        },
        {
            name: "runCommand",
            description: "Executes a shell command in the user's workspace on the server terminal. Use this to install dependencies, run tests, or execute scripts. Output will be returned.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "The shell command to run (e.g. 'ls -la', 'npm install', 'python script.py')." }
                },
                required: ["command"]
            }
        }
    ];

    return rawTools.map(t => ({
        type: 'function',
        function: t
    }));
};

// Execute the requested tool from the AI
const executeTool = async (functionName, args, userId) => {
    try {
        switch (functionName) {
            case "readFile": {
                // Find file in DB
                // In KevRyn architecture, file names might just be strings in the DB
                const file = await File.findOne({ owner: userId, name: { $regex: new RegExp(args.fileName, 'i') } });
                if (!file) return { error: `File ${args.fileName} not found in workspace.` };
                return { content: file.content || "/* Empty File */" };
            }
            case "writeFile": {
                let file = await File.findOne({ owner: userId, name: args.fileName });
                if (file) {
                    file.content = args.content;
                    await file.save();
                } else {
                    file = new File({
                        name: args.fileName,
                        type: 'file',
                        content: args.content,
                        owner: userId,
                        parentId: 'root'
                    });
                    await file.save();
                }
                return { success: true, message: `Successfully wrote ${args.content.length} characters to ${args.fileName}` };
            }
            case "listFiles": {
                const files = await File.find({ owner: userId }, 'name type');
                const list = files.map(f => `${f.type === 'folder' ? '📁' : '📄'} ${f.name}`);
                return { files: list };
            }
            case "runCommand": {
                try {
                    console.log(`[AGENT-SHELL] Executing: ${args.command}`);
                    
                    // First, we must ensure the files from MongoDB are actually on the disk for the shell to see them.
                    // This is a "Cold Workspace" sync.
                    const userFiles = await File.find({ owner: userId, type: 'file' });
                    const tempDir = path.join(os.tmpdir(), `kevryn_agent_${userId}`);
                    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

                    for (const f of userFiles) {
                        const filePath = path.join(tempDir, f.name);
                        const dir = path.dirname(filePath);
                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                        fs.writeFileSync(filePath, f.content);
                    }

                    const { stdout, stderr } = await execAsync(args.command, { cwd: tempDir, timeout: 30000 });
                    return { 
                        stdout: stdout || "No output", 
                        stderr: stderr || "No errors",
                        exitCode: 0 
                    };
                } catch (err) {
                    return { 
                        stdout: err.stdout || "", 
                        stderr: err.stderr || err.message,
                        exitCode: err.code || 1 
                    };
                }
            }
            default:
                return { error: `Tool ${functionName} is not recognized.` };
        }
    } catch (e) {
        return { error: `Execution crashed: ${e.message}` };
    }
};

module.exports = {
    getOpenAIToolDeclarations,
    executeTool
};
