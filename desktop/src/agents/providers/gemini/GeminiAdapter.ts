import { AgentExtension, AgentStatus, ExtensionManifest } from '../../core/AgentExtension';
import axios from 'axios';
import * as https from 'https';

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

    async validateCredentials(credentials: any): Promise<string[]> {
        const apiKey = credentials?.apiKey?.trim();
        if (!apiKey) throw new Error('Enter a Gemini API key first.');
        try {
            const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
                params: { key: apiKey }, timeout: 20000,
                httpsAgent: new https.Agent({ family: 4 })
            });
            return (response.data?.models || [])
                .filter((model: any) => model.supportedGenerationMethods?.includes('generateContent'))
                .map((model: any) => String(model.name || '').replace(/^models\//, ''));
        } catch (error: any) {
            throw new Error(error.response?.data?.error?.message || this.networkError(error));
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

    async *sendChat(message: string, context: any): AsyncGenerator<string, void, unknown> {
        if (this.status !== 'RUNNING') {
            await this.launch();
        }

        if (!this.apiKey) {
            yield '? Core License Key missing. Please authenticate via KevRyn Settings.';
            return;
        }

        try {
            const workspace = context?.workspace ? `Workspace: ${context.workspace.name}\nFiles: ${(context.workspace.files || []).join(', ')}` : 'No local workspace is open.';
            const relatedFiles = (context?.relatedFiles || []).map((file: any) => `\nReferenced file: ${file.path}\n${file.content}`).join('\n');
            const searchResults = (context?.searchResults || []).map((result: any) => `${result.path}${result.line ? `:${result.line}` : ''} ${result.text || ''}`).join('\n');
            const editorContext = context?.editorContext ? `Cursor: line ${context.editorContext.cursor?.line || 1}, column ${context.editorContext.cursor?.column || 1}\nSelected text:\n${context.editorContext.selectedText || 'None'}` : 'No editor selection.';
            const managementContext = context?.managementSnapshot ? `Management institution data (college-scoped and live):\n${JSON.stringify(context.managementSnapshot)}` : '';
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
${managementContext}
${context?.actionRequest?.agentMode ? `The user approved this implementation plan: ${JSON.stringify(context.actionRequest.approvedPlan || context.projectPlan || {})}. Return a single fenced code block labelled kevryn-actions containing valid JSON only: {"actions":[{"type":"mkdir","path":"relative-folder"},{"type":"write","path":"relative-file","content":"complete content"},{"type":"rename","from":"old-relative-path","path":"new-relative-path"},{"type":"run","command":"safe local development command"}]}. Use only workspace-relative paths. Include only needed actions. Never use delete actions, shell redirection, or commands that erase data.` : context?.actionRequest?.planning ? `The user wants to create or revise this project plan: ${JSON.stringify(context.projectPlan || {})}. Do not create or change files yet. Ask only essential questions, propose sensible assumptions, and return a complete reviewable plan in one fenced code block labelled kevryn-plan containing valid JSON only: {"title":"","summary":"","assumptions":[""],"questions":[""],"steps":[""]}.` : context?.actionRequest?.needsTarget ? 'Do not provide code yet. Ask one concise question: which existing workspace file should be updated, or what exact new file path should be created?' : context?.actionRequest ? `Explicit user-requested workspace action: ${context.actionRequest.write ? 'replace the complete content of' : 'run'} ${context.actionRequest.path}${context.actionRequest.run && context.actionRequest.write ? ', then run it locally' : ''}. Return exactly one complete replacement file in one fenced code block for that path. Do not provide alternatives or unrelated files.` : ''}

If management institution data is supplied, answer from that data only. Never invent student, faculty, lab, attendance, or timetable records. Describe changes as proposals that require management confirmation. If the user asks for code, put every complete code suggestion in a fenced Markdown code block with its language. If you provide terminal commands, use a code block with language 'bash' or 'powershell'.`;

            const imageMatch = typeof context?.image === 'string' && context.image.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
            const parts: any[] = [{ text: systemPrompt + '\n\nUser: ' + message }];
            if (imageMatch && context.image.length <= 7 * 1024 * 1024) {
                parts.push({ inlineData: { mimeType: imageMatch[1], data: imageMatch[2] } });
            }
            const payload = {
                contents: [
                    { role: 'user', parts }
                ],
                generationConfig: { temperature: 0.7 }
            };

            const selectedModel = context?.model || 'gemini-3.7-flash';
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${this.apiKey}`,
                payload,
                { headers: { 'Content-Type': 'application/json' }, timeout: 60000, httpsAgent: new https.Agent({ family: 4 }) }
            );

            const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
            
            // Stream it back to the UI in chunks for a smooth effect
            const chunkSize = 20;
            for (let i = 0; i < text.length; i += chunkSize) {
                yield text.substring(i, i + chunkSize);
                await new Promise(r => setTimeout(r, 20)); // smooth streaming
            }

        } catch (error: any) {
            const errMsg = error.response?.data?.error?.message || this.networkError(error);
            yield `? KevRyn Neural Core Error: ${errMsg}`;
        }
    }

    dispose(): void {
        this.apiKey = null;
        this.status = 'NOT_INSTALLED';
    }

    private networkError(error: any): string {
        const code = error?.code || error?.cause?.code;
        if (code === 'ETIMEDOUT' || code === 'ENETUNREACH') return 'Network connection timed out. Check your internet or firewall and try again.';
        return error?.message || 'Unable to reach Google Gemini.';
    }
}
