/**
 * KevRyn AI Service — Your Neural Core
 * Primary: Groq (Llama 3.1 8B — same base model your adapter was trained on)
 * Groq is always-on, zero cold starts, free, and ultra-fast.
 */
const axios = require('axios');

const STUDENT_GROQ_KEYS = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY // Fallback
].filter(Boolean);

const FACULTY_GROQ_KEYS = [
    process.env.FACULTY_GROQ_API_KEY_1,
    process.env.FACULTY_GROQ_API_KEY_2,
    process.env.FACULTY_GROQ_API_KEY_3
].filter(Boolean);

// Groq 2026 Model Catalog Updates
const MODELS = {
    general: 'openai/gpt-oss-20b',
    complex: 'openai/gpt-oss-120b',
    vision: 'qwen/qwen3.6-27b'
};

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ── CHAT ─────────────────────────────────────────────────────────
const chat = async (messages, options = {}) => {
    const isFaculty = options.role === 'faculty';
    const activeKeys = isFaculty && FACULTY_GROQ_KEYS.length > 0 ? FACULTY_GROQ_KEYS : STUDENT_GROQ_KEYS;

    if (activeKeys.length === 0) {
        throw new Error(`No Groq API keys found for ${isFaculty ? 'faculty' : 'student'}. Please check your environment variables.`);
    }

    let lastError = null;
    const selectedModel = MODELS[options.modelCategory] || MODELS.general;
    
    let maxGlobalRetries = 2;
    let globalRetries = 0;

    for (let i = 0; i < activeKeys.length; i++) {
        const key = activeKeys[i];
        try {
            console.log(`[NeuralCore] Attempting KevRyn Neural Core with Key ${i+1} using ${selectedModel}...`);

            const payload = {
                model: selectedModel,
                messages: messages,
                temperature: 0.7,
                max_tokens: 2048,
                top_p: 0.9,
                stream: false
            };
            
            if (options.tools) {
                payload.tools = options.tools;
                payload.tool_choice = options.tool_choice || 'auto';
            }

            const response = await axios.post(GROQ_URL, payload, {
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            console.log(`[NeuralCore] Key ${i+1} response status: ${response.status}`);
            const message = response.data?.choices?.[0]?.message;
            if (!message) throw new Error('Model returned empty response');

            return { 
                content: message.content || "", 
                tool_calls: message.tool_calls || null,
                model: 'KevRyn Neural Core' 
            };
        } catch (e) {
            if (e.response && e.response.status === 429 && globalRetries < maxGlobalRetries) {
                globalRetries++;
                const errMsg = e.response?.data?.error?.message || "";
                let waitMs = 6000;
                const match = errMsg.match(/try again in ([0-9.]+)s/);
                if (match && match[1]) {
                    waitMs = parseFloat(match[1]) * 1000 + 500;
                }
                console.log(`[NeuralCore] Rate limit hit. Waiting ${waitMs}ms before retrying (Retry ${globalRetries}/${maxGlobalRetries})...`);
                await new Promise(r => setTimeout(r, waitMs));
                i--; // Retry same key
                continue;
            }
            console.error(`[NeuralCore] Key ${i+1} failed: ${e.message}`);
            lastError = e;
            // Continue to next key
        }
    }

    // If all keys fail
    if (lastError?.response?.data?.error) {
        throw new Error(`AI Error: ${lastError.response.data.error.message || JSON.stringify(lastError.response.data.error)}`);
    }
    throw new Error(`AI Service Error (All keys failed): ${lastError?.message || 'Unknown error'}`);
};

// ── ANALYZE ERROR (for terminal self-healing) ────────────────────
const analyzeError = async (code, language, terminalOutput) => {
    const messages = [{
        role: 'user',
        content: `You are a senior developer. A user has this code:\n\n\`\`\`${language || 'code'}\n${code}\n\`\`\`\n\nIt produced this error:\n\`\`\`\n${terminalOutput}\n\`\`\`\n\nExplain the bug in one sentence. Then provide the COMPLETE fixed code wrapped in a code block.`
    }];
    const result = await chat(messages);
    return result.content;
};

// ── GENERATE CODE ────────────────────────────────────────────────
const generateCode = async (description, language) => {
    const messages = [{
        role: 'user',
        content: `Write ${language || 'code'} for: ${description}. Provide only the code in a code block.`
    }];
    const result = await chat(messages);
    return result.content;
};

// Keep-alive not needed — Groq is always on
const startKeepAlive = () => {
    console.log('[NeuralCore] Groq is always-on — no keep-alive needed ✓');
};

module.exports = {
    chat,
    analyzeError,
    generateCode,
    startKeepAlive
};

