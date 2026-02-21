const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

// Groq AI service - Free & Fast
class GroqService {
    constructor() {
        this.apiKey = process.env.GROQ_API_KEY || '';
        this.model = 'llama-3.3-70b-versatile'; // Best free model for code
        this.envPath = path.join(__dirname, '..', '.env');

        if (this.apiKey) {
            this.groq = new Groq({ apiKey: this.apiKey });
        }
    }

    /**
     * Set API key at runtime (from UI) and persist to .env file
     */
    setApiKey(key) {
        this.apiKey = key;
        this.groq = new Groq({ apiKey: key });

        // Persist to .env file so it survives server restarts
        try {
            let envContent = '';
            if (fs.existsSync(this.envPath)) {
                envContent = fs.readFileSync(this.envPath, 'utf8');
            }

            // Update or add GROQ_API_KEY
            if (envContent.includes('GROQ_API_KEY=')) {
                envContent = envContent.replace(/GROQ_API_KEY=.*/g, `GROQ_API_KEY=${key}`);
            } else {
                envContent = envContent.trimEnd() + (envContent ? '\n' : '') + `GROQ_API_KEY=${key}\n`;
            }

            fs.writeFileSync(this.envPath, envContent);
            console.log('[GroqService] API key saved to .env file');
        } catch (err) {
            console.error('[GroqService] Failed to save API key to .env:', err.message);
        }
    }

    /**
     * Check if API key is configured
     */
    isAvailable() {
        return !!this.apiKey;
    }

    /**
     * Send chat message to Groq
     */
    async chat(messages, options = {}) {
        if (!this.apiKey) {
            throw new Error('Groq API key not configured. Set GROQ_API_KEY environment variable.');
        }

        try {
            const completion = await this.groq.chat.completions.create({
                messages: messages,
                model: this.model,
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens || 8192,
            });

            return completion.choices[0]?.message?.content || 'No response';
        } catch (error) {
            if (error.status === 429) {
                throw new Error('Rate limit exceeded. Free tier: 30 requests/minute.');
            }
            throw new Error(`Groq API error: ${error.message}`);
        }
    }

    /**
     * Explain code
     */
    async explainCode(code, language) {
        const messages = [
            {
                role: 'system',
                content: 'You are a helpful code assistant. Explain code clearly and concisely.'
            },
            {
                role: 'user',
                content: `Explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide a clear explanation of what it does.`
            }
        ];

        return await this.chat(messages);
    }

    /**
     * Fix bugs in code
     */
    async fixCode(code, language, error = '', projectContext = "") {
        const contextMsg = projectContext ? `\n\nProject Structure:\n${projectContext}` : "";
        const errorContext = error ? `\n\nThe code produces this error:\n${error}` : '';

        const messages = [
            {
                role: 'system',
                content: `You are an expert code debugger. Find and fix bugs in code. You have access to the project structure.${contextMsg} Return the COMPLETE corrected code with explanations. Do not abbreviate the code.`
            },
            {
                role: 'user',
                content: `Fix bugs in this ${language} code:${errorContext}\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide:\n1. Fixed code (Full content, no placeholders)\n2. Explanation of the bugs\n3. How you fixed them`
            }
        ];

        return await this.chat(messages);
    }

    /**
     * Optimize code
     */
    async optimizeCode(code, language) {
        const messages = [
            {
                role: 'system',
                content: 'You are a code optimization expert. Suggest performance improvements and best practices. Return the COMPLETE optimized code.'
            },
            {
                role: 'user',
                content: `Optimize this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide:\n1. Optimized code (Full content, no placeholders)\n2. Explanation of improvements\n3. Performance benefits`
            }
        ];

        return await this.chat(messages);
    }

    /**
     * Generate code from description
     */
    async generateCode(description, language) {
        const messages = [
            {
                role: 'system',
                content: `You are a code generator. Generate clean, working ${language} code based on user descriptions. Return the COMPLETE code.`
            },
            {
                role: 'user',
                content: `Generate ${language} code for: ${description}\n\nProvide well-structured, commented code. Do not use placeholders.`
            }
        ];

        return await this.chat(messages);
    }

    async analyzeError(code, language, errorOutput, projectContext = "") {
        const contextMsg = projectContext ? `\n\nProject Structure:\n${projectContext}` : "";
        const messages = [
            {
                role: 'system',
                content: `You are an expert debugger. Analyze errors and provide fixes. You have access to the project structure.${contextMsg} Return the COMPLETE fixed code.`
            },
            {
                role: 'user',
                content: `This ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`\n\nProduced this error:\n\`\`\`\n${errorOutput}\n\`\`\`\n\nProvide:\n1. Root cause of the error\n2. Fixed code (Full content)\n3. Explanation of the fix`
            }
        ];

        return await this.chat(messages);
    }

    /**
     * Add comments to code
     */
    async addComments(code, language) {
        const messages = [
            {
                role: 'system',
                content: 'You are a documentation expert. Add clear, helpful comments to code.'
            },
            {
                role: 'user',
                content: `Add descriptive comments to this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nReturn the code with helpful comments explaining each section.`
            }
        ];

        return await this.chat(messages);
    }
    /**
     * Generate structured implementation plan
     */
    async generateImplementationPlan(prompt, projectContext) {
        const messages = [
            {
                role: 'system',
                content: `You are a senior full-stack developer and architect.
                Your goal is to plan and implement changes based on user requests.
                
                You must return a STRICT JSON object (no markdown, no extra text) with this structure:
                {
                    "explanation": "Brief summary of what you will do or answer to the user's question",
                    "files": [
                        { "path": "filename.ext", "action": "create" | "update" | "delete", "content": "Full new content of the file" }
                    ],
                    "commands": ["npm install pkg"]
                }
                
                RULES:
                - For "update" action, provide the COMPLETE new file content, not a diff.
                - For "delete", content can be empty.
                - Ensure code is production-ready and bug-free.
                - commands should be an array of strings, or empty array [] if none needed.
                - If the user asks a question (e.g. "Why...?"), answer it in "explanation" and leave "files" and "commands" empty if appropriate.
                
                COMMAND RULES (CRITICAL):
                - For frontend/browser projects (HTML, CSS, browser JS): commands should be [] (empty). Do NOT run browser JS with "node".
                - For Node.js scripts (server-side only, no DOM/document usage): include "node filename.js".
                - For Python files: include "python filename.py".
                - For Java files: include "javac Filename.java" then "java Filename".
                - For C/C++ files: include compile then run commands.
                - For projects needing npm packages: include "npm install package-name" BEFORE any run commands.
                - NEVER run a file that uses browser APIs (document, window, DOM, alert, etc.) with "node".
                - If unsure whether to run, use empty commands [].
                
                IMPORTANT: Your response MUST be valid JSON. Do not include markdown blocks like \`\`\`json. Just the raw JSON.
                `
            },
            {
                role: 'user',
                content: `Project Context (Files):\n${JSON.stringify(projectContext)}\n\nUser Request: ${prompt}\n\nGenerate the implementation plan in JSON.`
            }
        ];

        try {
            const response = await this.chat(messages, { temperature: 0.1, response_format: { type: "json_object" } });

            // Robust JSON extraction: Find first { and last }
            let jsonStr = response.trim();
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
            }

            const parsed = JSON.parse(jsonStr);

            // Basic validation
            if (!parsed.files || !Array.isArray(parsed.files)) {
                // Determine if it looks like a plan structure at all, if not, try to fix
                if (parsed.explanation && !parsed.files) {
                    parsed.files = []; // Fix missing files array
                    parsed.commands = parsed.commands || [];
                } else {
                    throw new Error("Invalid plan format: 'files' array missing.");
                }
            }

            return parsed;
        } catch (e) {
            console.error("Plan Gen Error (Raw Response):", e.message);
            throw e;
        }
    }
}

module.exports = new GroqService();
