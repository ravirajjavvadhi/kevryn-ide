import { AgentExtension, AgentStatus, ExtensionManifest } from '../../core/AgentExtension';
import axios from 'axios';

export class GeminiAdapter implements AgentExtension {
    private status: AgentStatus = 'NOT_INSTALLED';
    private apiKey: string | null = null;

    getManifest(): ExtensionManifest {
        return {
            id: 'google-gemini',
            name: 'Google Gemini',
            publisher: 'KevRyn',
            version: '2.5.0',
            description: 'Advanced AI Agent powered by Google Gemini',
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
            this.apiKey = credentials.apiKey.trim();
            this.status = 'AUTHENTICATED';
            return true;
        }
        return false;
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

    async *sendChat(message: string, context: any): AsyncGenerator<string, void, unknown> {
        if (this.status !== 'RUNNING') {
            await this.launch();
        }

        if (!this.apiKey) {
            yield '? Core License Key missing. Please authenticate via KevRyn Settings.';
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

            const payload = {
                contents: [
                    { role: 'user', parts: [{ text: systemPrompt + '\n\nUser: ' + message }] }
                ],
                generationConfig: { temperature: 0.7 }
            };

            const selectedModel = context?.model || 'gemini-3.7-flash';
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${this.apiKey}`,
                payload,
                { headers: { 'Content-Type': 'application/json' } }
            );

            const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
            
            // Stream it back to the UI in chunks for a smooth effect
            const chunkSize = 20;
            for (let i = 0; i < text.length; i += chunkSize) {
                yield text.substring(i, i + chunkSize);
                await new Promise(r => setTimeout(r, 20)); // smooth streaming
            }

        } catch (error: any) {
            const errMsg = error.response?.data?.error?.message || error.message;
            yield `? KevRyn Neural Core Error: ${errMsg}`;
        }
    }

    dispose(): void {
        this.apiKey = null;
        this.status = 'NOT_INSTALLED';
    }
}
