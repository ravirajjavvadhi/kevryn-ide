import { AgentExtension, AgentStatus, ExtensionManifest } from '../../core/AgentExtension';

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

            // Simple routing based on prompt complexity
            let selectedModel = "openai/gpt-oss-20b";
            if (message.length > 200 || message.toLowerCase().includes("analyze") || message.toLowerCase().includes("refactor")) {
                selectedModel = "openai/gpt-oss-120b";
            }

            const payload = {
                model: selectedModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ],
                temperature: 0.7,
                stream: true
            };

            const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                yield `❌ Groq API Error: ${errData.error?.message || response.statusText}`;
                return;
            }

            // Stream parsing logic (Server-Sent Events)
            const reader = response.body?.getReader();
            const decoder = new TextDecoder("utf-8");

            if (!reader) {
                yield "❌ Error: Response body is not readable.";
                return;
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const content = data.choices[0]?.delta?.content;
                            if (content) {
                                yield content;
                            }
                        } catch (e) {
                            // ignore parse errors on incomplete chunks
                        }
                    }
                }
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
