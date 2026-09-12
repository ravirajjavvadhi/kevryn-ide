import { AgentExtension, AgentStatus, ExtensionManifest } from '../../core/AgentExtension';
import axios from 'axios';
import * as https from 'https';

export class GroqAdapter implements AgentExtension {
    private status: AgentStatus = 'NOT_INSTALLED';
    private apiKey: string | null = null;

    getManifest(): ExtensionManifest {
        return {
            id: 'groq-assistant',
            name: 'Groq Neural Core',
            publisher: 'KevRyn',
            version: '1.0.0',
            description: 'Lightning-fast AI Agent powered by GPT OSS 120B/20B & Qwen 27B',
            capabilities: ['chat', 'workspace-read', 'terminal-execute']
        };
    }

    getStatus(): AgentStatus {
        return this.status;
    }

    async install(): Promise<boolean> {
        this.status = 'AUTH_REQUIRED';
        return true;
    }

    async authenticate(credentials: any): Promise<boolean> {
        if (credentials.apiKey) {
            this.apiKey = credentials.apiKey;
            this.status = 'AUTHENTICATED';
            return true;
        }
        return false;
    }

    async validateCredentials(credentials: any): Promise<string[]> {
        const apiKey = credentials?.apiKey?.trim();
        if (!apiKey) throw new Error('Enter a Groq API key first.');
        try {
            const response = await axios.get('https://api.groq.com/openai/v1/models', {
                headers: { Authorization: `Bearer ${apiKey}` }, timeout: 20000,
                httpsAgent: new https.Agent({ family: 4 })
            });
            return (response.data?.data || []).map((model: any) => model.id).filter(Boolean);
        } catch (error: any) {
            const message = error.response?.data?.error?.message || error.message;
            throw new Error(error.code === 'ETIMEDOUT' ? 'Network connection timed out. Check your internet or firewall and try again.' : message);
        }
    }

    async launch(): Promise<void> {
        if (this.status === 'AUTHENTICATED') {
            this.status = 'RUNNING';
        }
    }

    async stop(): Promise<void> {
        if (this.status === 'RUNNING') {
            this.status = 'AUTHENTICATED';
        }
    }

    async *sendChat(message: string, context?: any): AsyncGenerator<string, void, unknown> {
        if ((this.status !== 'RUNNING' && this.status !== 'AUTHENTICATED') || !this.apiKey) {
            yield "❌ Agent is not authenticated or running.";
            return;
        }

        try {
            const systemPrompt = `You are an advanced AI Agent in the KevRyn Desktop IDE. 
You have access to the user's workspace context.
Current File: ${context?.fileName || 'None'}
Language: ${context?.language || 'None'}
Code Context:
${context?.code || 'Empty'}

If the user asks for code, provide it cleanly. If you provide terminal commands, use a code block with language 'bash' or 'powershell'.`;

            // The user explicitly chooses the model in the desktop AI workspace.
            const selectedModel = context?.model || 'openai/gpt-oss-120b';

            const payload = {
                model: selectedModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ],
                temperature: 0.7,
                // Axios receives a normal JSON response here. Keeping this false is
                // essential: a streamed SSE response has no `choices[0].message`.
                stream: false
            };

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, {
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
                timeout: 60000, httpsAgent: new https.Agent({ family: 4 })
            });
            const text = response.data?.choices?.[0]?.message?.content || 'No response generated.';
            for (let i = 0; i < text.length; i += 20) {
                yield text.substring(i, i + 20);
                await new Promise(r => setTimeout(r, 15));
            }

        } catch (error: any) {
            const message = error.response?.data?.error?.message || (error.code === 'ETIMEDOUT' ? 'Network connection timed out. Check your internet or firewall and try again.' : error.message);
            yield `❌ Groq API Error: ${message}`;
        }
    }

    dispose(): void {
        this.apiKey = null;
        this.status = 'NOT_INSTALLED';
    }
}
