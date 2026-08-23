const express = require('express');
const router = express.Router();
const { authenticate } = require('../utils/authMiddleware');
const aiService = require('../services/aiService');
const ChatSession = require('../models/ChatSession');
const aiTools = require('../utils/aiTools');

// ── BOOT: Start keep-alive ping (deferred, non-blocking) ────────
try { setTimeout(() => aiService.startKeepAlive(), 10000); } catch(e) { console.warn('[AI] Keep-alive init error:', e.message); }

// ── SESSION CRUD ─────────────────────────────────────────────────
router.get('/sessions', authenticate, async (req, res, next) => {
    try {
        const sessions = await ChatSession.find({ userId: req.user.userId })
            .select('title updatedAt')
            .sort({ updatedAt: -1 });
        res.json({ sessions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/sessions/:id', authenticate, async (req, res, next) => {
    try {
        const session = await ChatSession.findOne({ _id: req.params.id, userId: req.user.userId });
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json({ session });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/sessions/:id', authenticate, async (req, res, next) => {
    try {
        await ChatSession.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── CHAT ─────────────────────────────────────────────────────────
router.post('/chat', authenticate, async (req, res, next) => {
    try {
        const { messages, sessionId } = req.body;
        console.log(`[AI-CHAT] Messages:`, messages ? messages.length : 0);
        
        const systemContext = `You are KevRyn AI, a highly capable coding assistant with access to the user's workspace, files, and terminal.
CRITICAL INSTRUCTIONS:
- If the user asks for code (e.g. "code for hello world") without specifying a language, provide ONLY ONE language (e.g. Python). DO NOT provide multiple languages.
- When generating code, output ONLY the code in a markdown block. Do not include introductory filler or explanatory text unless explicitly requested.
- Keep your answers extremely concise to save context window.
- Use your tools to read files or run terminal commands if the user asks you to interact with their workspace.`;

        // Strip out MongoDB _id or other internal properties before sending to Groq API
        const cleanMessages = messages.map(m => ({ role: m.role, content: m.content }));
        
        // Ensure system prompt is injected
        if (cleanMessages[0]?.role !== 'system') {
            cleanMessages.unshift({ role: 'system', content: systemContext });
        } else {
            cleanMessages[0].content = systemContext;
        }

        const tools = aiTools.getOpenAIToolDeclarations();
        let result = await aiService.chat(cleanMessages, { tools });
        console.log(`[AI-CHAT] Result received`);

        // Handle tool calls loop
        let loopCount = 0;
        while (result.tool_calls && loopCount < 5) {
            cleanMessages.push({ role: 'assistant', content: result.content || "", tool_calls: result.tool_calls });
            
            for (const toolCall of result.tool_calls) {
                let args = {};
                try {
                    args = JSON.parse(toolCall.function.arguments || '{}');
                } catch (e) {
                    console.log(`[AI-CHAT] Warning: JSON parse failed for tool arguments:`, toolCall.function.arguments);
                }
                console.log(`[AI-CHAT] Executing tool ${toolCall.function.name}...`);
                const toolResult = await aiTools.executeTool(toolCall.function.name, args, req.user.userId);
                
                cleanMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolCall.function.name,
                    content: JSON.stringify(toolResult)
                });
            }
            // Call LLM again to get final answer
            result = await aiService.chat(cleanMessages, { tools });
            loopCount++;
        }

        const safeContent = result.content || "[Tool execution completed successfully]";

        // Persist session
        let session;
        if (sessionId) {
            session = await ChatSession.findOne({ _id: sessionId, userId: req.user.userId });
        }
        if (!session) {
            session = new ChatSession({
                userId: req.user.userId,
                title: messages[messages.length - 1].content.substring(0, 40),
                messages: [...messages, { role: 'assistant', content: safeContent }]
            });
        } else {
            session.messages.push(messages[messages.length - 1]);
            session.messages.push({ role: 'assistant', content: safeContent });
        }
        console.log(`[AI-CHAT] Saving session...`);
        await session.save();
        console.log(`[AI-CHAT] Session saved: ${session._id}`);

        res.json({
            response: safeContent,
            model: result.model,
            sessionId: session._id
        });
    } catch (error) {
        console.error('[AI Chat Error]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── AGENTIC LOOP (with workspace tools) ──────────────────────────
router.post('/agent/run', authenticate, async (req, res, next) => {
    try {
        const { prompt, sessionId } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        console.log(`[Agent] User: ${req.user.userId}`);

        // Build system prompt with workspace context
        const fileList = await aiTools.executeTool('listFiles', {}, req.user.userId);
        const systemContext = `You are the KevRyn Autonomous Agent, a professional AI built into a cloud IDE.
You have access to the user's workspace. Here are their files:
${fileList.files ? fileList.files.join('\n') : 'Empty workspace'}

When the user asks you to build something, write complete, working code.
If they ask about their code, analyze it thoroughly.
Always aim for zero-bug delivery.`;

        const messages = [
            { role: 'system', content: systemContext },
            { role: 'user', content: prompt }
        ];

        const result = await aiService.chat(messages);

        // Persist session
        let session;
        if (sessionId) {
            session = await ChatSession.findOne({ _id: sessionId, userId: req.user.userId });
        }
        if (!session) {
            session = new ChatSession({
                userId: req.user.userId,
                title: `[Agent] ${prompt.substring(0, 40)}`,
                messages: [
                    { role: 'user', content: prompt },
                    { role: 'assistant', content: result.content }
                ]
            });
        } else {
            session.messages.push({ role: 'user', content: prompt });
            session.messages.push({ role: 'assistant', content: result.content });
        }
        await session.save();

        res.json({
            response: result.content,
            model: result.model,
            sessionId: session._id
        });
    } catch (error) {
        console.error('[Agent Error]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── FACULTY AI ASSISTANT (WITH MCP TOOLS) ──────────────────────────
const mcpTools = require('../services/mcpTools');

router.post('/faculty-assistant', authenticate, async (req, res, next) => {
    try {
        if (req.user.role !== 'faculty') return res.status(403).json({ error: 'Faculty only' });
        const { messages, sessionId } = req.body;
        if (!messages) return res.status(400).json({ error: 'Messages are required' });

        const backendUrl = process.env.BASE_URL || 'https://kevryn-ide.onrender.com';
        const systemContext = `You are the KevRyn Faculty Assistant, a professional AI embedded in the Faculty Command Center.
You have access to advanced MCP tools to fetch live lab session data, generate CSV reports, track student competitive programming stats, and execute dynamic database queries.

DATABASE TERMINOLOGY GUIDE & ALLOWED MODELS:
- User: Contains student profiles (username, rollNumber, fullName, role).
- Course/Subject: Courses are mapped in the 'Course' collection (name field).
- Assignments: Created by faculty in the 'Assignment' collection (title, subjectName).
- Submissions: Student code uploads in the 'Submission' collection (assignmentId, studentUsername, score, submittedAt).
- LabSession: Attendance and session records in the 'LabSession' collection (sessionName, subject, startTime, activeStudents).
- DeveloperMetrics: Live stats from Github, Leetcode, Hackerrank in the 'DeveloperMetrics' collection.

When asked about sessions, submissions, or reports, use the dedicated tools ('get_lab_sessions', 'get_recent_submissions'). 
If the faculty asks for something entirely custom or analytical (e.g. "average score", "who hasn't submitted", "list assignments matching X"), use the 'execute_read_query' tool to construct a MongoDB query on the relevant model.
If you need to provide a report link for a specific session ID, format it using standard markdown pointing to the printable PDF: [🖨️ Print Official PDF](${backendUrl}/api/lab/sessions/ID/print).`;

        const fullMessages = [
            { role: 'system', content: systemContext },
            ...messages.map(m => ({ role: m.role, content: m.content }))
        ];

        // Determine Model Capability based on context
        const lastUserMessage = messages[messages.length - 1].content.toLowerCase();
        let modelCategory = 'general';
        if (
            lastUserMessage.includes('report') || 
            lastUserMessage.includes('session') || 
            lastUserMessage.includes('student') || 
            lastUserMessage.includes('detail') ||
            lastUserMessage.includes('analyze')
        ) {
            modelCategory = 'complex'; // Use 120B for complex agentic/reporting tasks
        }

        // Call LLM with tools
        let result = await aiService.chat(fullMessages, { tools: mcpTools.tools, modelCategory, role: 'faculty' });
        
        // Handle tool calls loop
        let loopCount = 0;
        while (result.tool_calls && loopCount < 5) {
            fullMessages.push({ role: 'assistant', content: result.content || "", tool_calls: result.tool_calls });
            
            for (const toolCall of result.tool_calls) {
                let args = {};
                try {
                    args = JSON.parse(toolCall.function.arguments || '{}');
                } catch (e) {
                    console.log(`[Faculty AI] Warning: JSON parse failed for tool arguments:`, toolCall.function.arguments);
                }
                console.log(`[Faculty AI] Executing tool ${toolCall.function.name}...`);
                const toolResult = await mcpTools.executeTool(toolCall.function.name, args, req.user.userId);
                
                fullMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: toolCall.function.name,
                    content: JSON.stringify(toolResult)
                });
            }
            // Call LLM again to get final answer
            result = await aiService.chat(fullMessages, { tools: mcpTools.tools, modelCategory, role: 'faculty' });
            loopCount++;
        }

        const safeContent = result.content || "[Tool execution completed successfully]";

        // Persist session
        let session;
        if (sessionId) {
            session = await ChatSession.findOne({ _id: sessionId, userId: req.user.userId });
        }
        if (!session) {
            session = new ChatSession({
                userId: req.user.userId,
                title: `[Faculty] ${messages[messages.length - 1].content.substring(0, 40)}`,
                messages: [...messages, { role: 'assistant', content: safeContent }]
            });
        } else {
            session.messages.push(messages[messages.length - 1]);
            session.messages.push({ role: 'assistant', content: safeContent });
        }
        await session.save();

        res.json({
            response: safeContent,
            model: result.model,
            sessionId: session._id
        });
    } catch (error) {
        console.error('[Faculty Assistant Error]', error.message);
        res.json({ response: `[DEBUG REAL ERROR] ${error.message} - Stack: ${error.stack}` });
    }
});

// ── TERMINAL SELF-HEALING ────────────────────────────────────────
router.post('/fix-terminal-error', authenticate, async (req, res, next) => {
    try {
        const { code, terminalOutput, language } = req.body;
        if (!code || !terminalOutput) {
            return res.status(400).json({ error: 'Code and terminal output required' });
        }

        const fixResponse = await aiService.analyzeError(code, language, terminalOutput);

        const explanationPart = fixResponse.split('```')[0].trim();
        const codeBlockMatch = fixResponse.match(/```[a-z]*\n([\s\S]*?)```/i);
        const fixedCode = codeBlockMatch ? codeBlockMatch[1].trim() : code;

        res.json({
            explanation: explanationPart || 'Error analyzed and fixed.',
            fixedCode
        });
    } catch (error) {
        console.error('[Fix Error]', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
