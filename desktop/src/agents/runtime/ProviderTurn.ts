import axios from 'axios';
import { TurnRequest, Turn, TOOLS } from './Protocol';
import { randomUUID } from 'crypto';

// Preserve Gemini response parts (including provider signatures) across tool turns.
export async function providerTurn(provider: 'gemini' | 'groq', key: string, req: TurnRequest): Promise<Turn> {
    if (!key) throw new Error('Configure your provider API key first.');
    if (provider === 'groq') {
        if (req.attachment) throw new Error('Use Gemini for image/PDF attachments.');
        const messages: any[] = [{ role: 'system', content: req.system }, ...req.messages.map(m => m.role === 'tool'
            ? { role: 'tool', tool_call_id: m.callId, content: m.content }
            : { role: m.role, content: m.content || null, ...(m.calls?.length ? { tool_calls: m.calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}) })];
        const { data } = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: req.model, messages, tools: TOOLS.map(t => ({ type: 'function', function: t })), temperature: 0.2, max_completion_tokens: 4096
        }, { signal: req.signal, timeout: 90000, headers: { Authorization: `Bearer ${key}` } });
        const msg = data.choices?.[0]?.message;
        if (!msg) throw new Error('Provider returned no response.');
        return { text: msg.content || '', calls: (msg.tool_calls || []).map((c: any) => ({ id: c.id, name: c.function.name, args: JSON.parse(c.function.arguments) })) };
    }
    const contents: any[] = [];
    for (const m of req.messages) {
        const role = m.role === 'assistant' ? 'model' : 'user';
        const parts = m.role === 'tool' ? [{ functionResponse: { name: m.name, response: { result: m.content } } }]
            : m.rawParts || [{ text: m.content || 'Continue.' }];
        if (contents.length && contents[contents.length - 1].role === role) contents[contents.length - 1].parts.push(...parts);
        else contents.push({ role, parts: [...parts] });
    }
    if (req.attachment) {
        const match = req.attachment.data?.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
        if (!match || req.attachment.data.length > 14 * 1024 * 1024) throw new Error('Invalid attachment or attachment exceeds 10 MB.');
        const target = contents.find(c => c.role === 'user');
        if (/^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(match[1])) target.parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        else if (/^(text\/|application\/(json|javascript|xml))/.test(match[1])) {
            const text = Buffer.from(match[2], 'base64').toString('utf8');
            if (text.length > 50000) throw new Error('Text attachment exceeds 50,000 characters.');
            target.parts.push({ text: `Untrusted attachment ${req.attachment.name}:\n${text}` });
        } else throw new Error('Unsupported attachment type.');
    }
    const { data } = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`, {
        systemInstruction: { parts: [{ text: req.system }] }, contents, tools: [{ functionDeclarations: TOOLS }], generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
    }, { signal: req.signal, timeout: 90000, headers: { 'x-goog-api-key': key } });
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error('Provider returned no content; check model support or safety feedback.');
    return { text: parts.filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join(''), rawParts: parts,
        calls: parts.filter((p: any) => p.functionCall).map((p: any) => ({ id: randomUUID(), name: p.functionCall.name, args: p.functionCall.args || {} })) };
}
