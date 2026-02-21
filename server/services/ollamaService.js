const axios = require('axios');

// Ollama service for local AI
class OllamaService {
    constructor() {
        this.baseURL = process.env.OLLAMA_URL || 'http://localhost:11434';
        this.model = process.env.OLLAMA_MODEL || 'deepseek-coder:6.7b';
    }

    /**
     * Check if Ollama is running
     */
    async isAvailable() {
        try {
            await axios.get(`${this.baseURL}/api/tags`);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * List available models
     */
    async listModels() {
        try {
            const response = await axios.get(`${this.baseURL}/api/tags`);
            return response.data.models || [];
        } catch (error) {
            throw new Error('Ollama not running. Please start Ollama service.');
        }
    }

    /**
     * Send chat message to Ollama
     */
    async chat(messages, options = {}) {
        try {
            const response = await axios.post(`${this.baseURL}/api/chat`, {
                model: this.model,
                messages: messages,
                stream: false,
                options: {
                    temperature: options.temperature || 0.7,
                    top_p: options.top_p || 0.9,
                }
            });

            return response.data.message.content;
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Ollama is not running. Please start Ollama: ollama serve');
            }
            throw new Error(`Ollama error: ${error.message}`);
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
    async fixCode(code, language, error = '') {
        const errorContext = error ? `\n\nThe code produces this error:\n${error}` : '';

        const messages = [
            {
                role: 'system',
                content: 'You are an expert code debugger. Find and fix bugs in code. Return the corrected code with explanations.'
            },
            {
                role: 'user',
                content: `Fix bugs in this ${language} code:${errorContext}\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide:\n1. Fixed code\n2. Explanation of the bugs\n3. How you fixed them`
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
                content: 'You are a code optimization expert. Suggest performance improvements and best practices.'
            },
            {
                role: 'user',
                content: `Optimize this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide:\n1. Optimized code\n2. Explanation of improvements\n3. Performance benefits`
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
                content: `You are a code generator. Generate clean, working ${language} code based on user descriptions.`
            },
            {
                role: 'user',
                content: `Generate ${language} code for: ${description}\n\nProvide well-structured, commented code.`
            }
        ];

        return await this.chat(messages);
    }

    /**
     * Analyze error from terminal
     */
    async analyzeError(code, language, errorOutput) {
        const messages = [
            {
                role: 'system',
                content: 'You are an expert debugger. Analyze errors and provide fixes.'
            },
            {
                role: 'user',
                content: `This ${language} code:\n\`\`\`${language}\n${code}\n\`\`\`\n\nProduced this error:\n\`\`\`\n${errorOutput}\n\`\`\`\n\nProvide:\n1. Root cause of the error\n2. Fixed code\n3. Explanation of the fix`
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
}

module.exports = new OllamaService();
