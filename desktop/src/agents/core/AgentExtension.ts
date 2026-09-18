export interface ExtensionManifest {
    id: string;
    name: string;
    publisher: string;
    version: string;
    description: string;
    capabilities: string[];
}

export type AgentStatus = 'NOT_INSTALLED' | 'AUTH_REQUIRED' | 'AUTHENTICATED' | 'STARTING' | 'RUNNING' | 'ERROR';

export interface AgentExtension {
    getManifest(): ExtensionManifest;
    getStatus(): AgentStatus;
    
    // Lifecycle
    install(): Promise<boolean>;
    authenticate(credentials: any): Promise<boolean>;
    validateCredentials(credentials: any): Promise<string[]>;
    launch(): Promise<void>;
    stop(): Promise<void>;
    
    // Core interaction
    sendChat(message: string, context: any): AsyncGenerator<string, void, unknown>;
    agentTurn?(request: import('../runtime/Protocol').TurnRequest): Promise<import('../runtime/Protocol').Turn>;
    
    // Disposes resources
    dispose(): void;
}
