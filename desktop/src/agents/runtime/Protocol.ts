export type Mode = 'ask' | 'edit' | 'trusted';
export interface ToolCall { id: string; name: string; args: Record<string, any> }
export interface Turn { text: string; calls: ToolCall[]; rawParts?: any[] }
export interface Message { role: 'user' | 'assistant' | 'tool'; content: string; calls?: ToolCall[]; rawParts?: any[]; callId?: string; name?: string }
export interface TurnRequest { model: string; system: string; messages: Message[]; signal: AbortSignal; attachment?: { name: string; data: string; mimeType: string } }
const s = (description: string) => ({ type: 'string', description });
const n = (description: string) => ({ type: 'integer', description });
const tool = (name: string, description: string, properties: any, required: string[]) => ({ name, description, parameters: { type: 'object', properties, required } });
export const TOOLS = [
    tool('list_files', 'Discover workspace files recursively. Paginated; use offset to continue. Secret/generated files are excluded.', { directory: s('Relative directory, default .'), offset: n('Pagination offset') }, []),
    tool('search_files', 'Search literal text across workspace files, returning paths and line numbers. Follow matches with read_file.', { query: s('Literal search text'), directory: s('Relative directory'), offset: n('Result offset') }, ['query']),
    tool('read_file', 'Read a file range. Must read an existing file before editing it; use the returned version for writes.', { path: s('Workspace-relative path'), start: n('First line, 1-based'), end: n('Last line') }, ['path']),
    tool('write_file', 'Propose complete UTF-8 file content. Existing files require version from read_file. Requires user permission. Prefer patch_file for small edits.', { path: s('Relative path'), content: s('Complete new content'), version: s('Read version, or new for a new file') }, ['path','content','version']),
    tool('patch_file', 'Replace exactly one matching text block in a file read earlier. Fails on ambiguity or stale version.', { path: s('Relative path'), before: s('Exact nonempty existing text'), after: s('Replacement text'), version: s('Read version') }, ['path','before','after','version']),
    tool('make_directory', 'Create a workspace directory after permission.', { path: s('Relative directory') }, ['path']),
    tool('rename_file', 'Rename a previously read file without overwriting another file.', { path: s('Existing relative path'), to: s('New relative path'), version: s('Read version') }, ['path','to','version']),
    tool('run_command', 'Run a local shell command after approval. Working directory is NOT an OS sandbox. Returns output, exit status or a running process ID. Use process_output for long-running jobs.', { command: s('Exact shell command'), cwd: s('Relative working directory, default .'), timeoutSeconds: n('Maximum lifetime, default 120, maximum 1800') }, ['command']),
    tool('process_output', 'Read output and status for a process created in this task.', { processId: s('Process ID') }, ['processId']),
    tool('process_input', 'Send input to an approved task process.', { processId: s('Process ID'), input: s('Input text, including newline if required') }, ['processId','input']),
    tool('stop_process', 'Stop a process created in this task.', { processId: s('Process ID') }, ['processId']),
    tool('propose_plan', 'Present a project implementation plan. Waits for user approval. Do this before building a new multi-file application or making a material scope change.', { title: s('Plan title'), steps: { type: 'array', items: { type: 'string' } }, summary: s('Architecture, assumptions and verification approach') }, ['title','steps','summary'])
];
