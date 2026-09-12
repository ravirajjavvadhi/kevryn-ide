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
            const workspace = context?.workspace ? `Workspace: ${context.workspace.name}\nFiles: ${(context.workspace.files || []).join(', ')}` : 'No local workspace is open.';
            const relatedFiles = (context?.relatedFiles || []).map((file: any) => `\nReferenced file: ${file.path}\n${file.content}`).join('\n');
            const searchResults = (context?.searchResults || []).map((result: any) => `${result.path}${result.line ? `:${result.line}` : ''} ${result.text || ''}`).join('\n');
            const editorContext = context?.editorContext ? `Cursor: line ${context.editorContext.cursor?.line || 1}, column ${context.editorContext.cursor?.column || 1}\nSelected text:\n${context.editorContext.selectedText || 'None'}` : 'No editor selection.';
            const systemPrompt = `You are an advanced AI Agent in the KevRyn Desktop IDE.
You are workspace-aware. Use the active file and workspace inventory below; do not claim a file is closed when it is listed.
${workspace}
Current File: ${context?.fileName || 'None'}
Language: ${context?.language || 'None'}
Code Context:
${context?.code || 'Empty'}
${editorContext}
${relatedFiles}
Search results: ${searchResults || 'None'}
${context?.actionRequest?.agentMode ? `The user approved this implementation plan: ${JSON.stringify(context.actionRequest.approvedPlan || context.projectPlan || {})}. Return a single fenced code block labelled kevryn-actions containing valid JSON only: {"actions":[{"type":"mkdir","path":"relative-folder"},{"type":"write","path":"relative-file","content":"complete content"},{"type":"rename","from":"old-relative-path","path":"new-relative-path"},{"type":"run","command":"safe local development command"}]}. Use only workspace-relative paths. Include only needed actions. Never use delete actions, shell redirection, or commands that erase data.` : context?.actionRequest?.planning ? `The user wants to create or revise this project plan: ${JSON.stringify(context.projectPlan || {})}. Do not create or change files yet. Ask only essential questions, propose sensible assumptions, and return a complete reviewable plan in one fenced code block labelled kevryn-plan containing valid JSON only: {"title":"","summary":"","assumptions":[""],"questions":[""],"steps":[""]}.` : context?.actionRequest?.needsTarget ? 'Do not provide code yet. Ask one concise question: which existing workspace file should be updated, or what exact new file path should be created?' : context?.actionRequest ? `Explicit user-requested workspace action: ${context.actionRequest.write ? 'replace the complete content of' : 'run'} ${context.actionRequest.path}${context.actionRequest.run && context.actionRequest.write ? ', then run it locally' : ''}. Return exactly one complete replacement file in one fenced code block for that path. Do not provide alternatives or unrelated files.` : ''}

If the user asks for code, put every complete code suggestion in a fenced Markdown code block with its language. If you provide terminal commands, use a code block with language 'bash' or 'powershell'.`;

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
