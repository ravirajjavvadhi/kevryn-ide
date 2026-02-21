const express = require('express');
const router = express.Router();
const groqService = require('../services/groqService');
const jwt = require('jsonwebtoken');
const File = require('../File');

// Helper: Get project file tree
async function getProjectFileTree(userId) {
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

// Auth middleware for AI routes
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Access denied" });
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET || 'my_super_secret_key_123');
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ error: "Invalid token" });
    }
};

// Check if Groq is available
router.get('/status', (req, res) => {
    try {
        const available = groqService.isAvailable();
        res.json({
            available,
            provider: 'groq',
            model: groqService.model,
            message: available ? 'Groq AI is ready' : 'Groq API key not set. Enter your key to get started.'
        });
    } catch (error) {
        res.json({ available: false, provider: 'groq', message: error.message });
    }
});

// Set API key at runtime
router.post('/api-key', (req, res) => {
    try {
        const { apiKey } = req.body;
        if (!apiKey || !apiKey.trim()) {
            return res.status(400).json({ error: 'API key is required' });
        }
        groqService.setApiKey(apiKey.trim());
        res.json({ success: true, message: 'Groq API key configured successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Chat with AI
router.post('/chat', verifyToken, async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array required' });
        }


        const projectContext = await getProjectFileTree(req.user.userId);

        // Inject context into system message if exists, or add one
        if (projectContext) {
            const systemMsg = `\n\nProject Structure:\n${projectContext}`;
            let systemFound = false;
            for (let m of messages) {
                if (m.role === 'system') {
                    m.content += systemMsg;
                    systemFound = true;
                    break;
                }
            }
            if (!systemFound) {
                messages.unshift({ role: 'system', content: `You are a helpful AI assistant. You have access to the project structure:${systemMsg}` });
            }
        }

        const response = await groqService.chat(messages);
        res.json({ response });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Explain code
router.post('/explain', verifyToken, async (req, res) => {
    try {
        const { code, language } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        const explanation = await groqService.explainCode(code, language || 'code');
        res.json({ explanation });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Fix code
router.post('/fix', verifyToken, async (req, res) => {
    try {
        const { code, language, error } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        const projectContext = await getProjectFileTree(req.user.userId);
        const fixed = await groqService.fixCode(code, language || 'code', error, projectContext);
        res.json({ fixed });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Optimize code
router.post('/optimize', verifyToken, async (req, res) => {
    try {
        const { code, language } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        const optimized = await groqService.optimizeCode(code, language || 'code');
        res.json({ optimized });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Generate code
router.post('/generate', verifyToken, async (req, res) => {
    try {
        const { description, language } = req.body;

        if (!description) {
            return res.status(400).json({ error: 'Description is required' });
        }

        const generated = await groqService.generateCode(description, language || 'javascript');
        res.json({ generated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Analyze error
router.post('/analyze-error', verifyToken, async (req, res) => {
    try {
        const { code, language, errorOutput } = req.body;

        if (!code || !errorOutput) {
            return res.status(400).json({ error: 'Code and error output are required' });
        }

        const projectContext = await getProjectFileTree(req.user.userId);
        const analysis = await groqService.analyzeError(code, language || 'code', errorOutput, projectContext);
        res.json({ analysis });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add comments
router.post('/comment', verifyToken, async (req, res) => {
    try {
        const { code, language } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'Code is required' });
        }

        const commented = await groqService.addComments(code, language || 'code');
        res.json({ commented });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Auto-Dev Plan Generation
router.post('/auto/plan', verifyToken, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        // Fetch project context
        const File = require('../File');
        const files = await File.find({ owner: req.user.userId });

        // Contextualize: Send file tree AND content of text files
        const fileTree = await getProjectFileTree(req.user.userId);

        const projectContext = files.map(f => ({
            name: f.name,
            content: f.content?.substring(0, 2000) // Cap content per file
        })).filter(f => !f.name.match(/\.(png|jpg|jpeg|gif|ico|pdf|zip|mp4)$/i));

        // Add the tree structure as a special "file" or just prepend to prompt
        const fullContext = `Project Directory Structure:\n${fileTree}\n\nFile Contents:\n${JSON.stringify(projectContext)}`;

        const plan = await groqService.generateImplementationPlan(prompt, fullContext);
        res.json({ plan });
    } catch (error) {
        console.error("Auto Plan Error:", error);
        res.status(500).json({ error: "Failed to generate plan: " + error.message });
    }
});

module.exports = router;
