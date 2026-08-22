import { AgentExtension, AgentStatus, ExtensionManifest } from '../../core/AgentExtension';

export class GeminiAdapter implements AgentExtension {
    private status: AgentStatus = 'NOT_INSTALLED';
    private apiKey: string | null = null;

    getManifest(): ExtensionManifest {
        return {
            id: 'google-gemini',
            name: 'Google Gemini',
            publisher: 'KevRyn',
            version: '2.5.0',
            description: 'Advanced AI Agent powered by Google Gemini 2.5 Flash',
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
            yield "❌ API Key missing. Please authenticate Google Gemini in the Agent Hub.";
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
                    { role: "user", parts: [{ text: systemPrompt + "\n\nUser: " + message }] }
                ],
                generationConfig: { temperature: 0.7 }
            };

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            if (data.error) {
                yield `❌ Gemini API Error: ${data.error.message}`;
                return;
            }

            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
            
            // Stream it back to the UI in chunks for a smooth effect
            const chunkSize = 20;
            for (let i = 0; i < text.length; i += chunkSize) {
                yield text.substring(i, i + chunkSize);
                await new Promise(r => setTimeout(r, 20)); // smooth streaming
            }

        } catch (error: any) {
            yield `❌ Local Agent Error: ${error.message}`;
        }
    }

    dispose(): void {
        this.apiKey = null;
        this.status = 'NOT_INSTALLED';
    }
}
