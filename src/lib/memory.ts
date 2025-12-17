import { JSONFilePreset } from 'lowdb/node';
import path from 'path';
import fs from 'fs';

// Define the shape of our memory
export interface ActionLogEntry {
    id: string;
    timestamp: number;
    sessionId?: string;
    operation: any;
    result: any;
}

export interface ConversationEntry {
    id: string;
    timestamp: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    sessionId?: string;
}

export interface MemoryData {
    shortTerm: Record<string, any[]>; // Ephemeral session data
    longTerm: Record<string, string>; // Facts
    actionLog: ActionLogEntry[];      // History of all file operations
    conversations: ConversationEntry[]; // History of messages
}

const defaultData: MemoryData = {
    shortTerm: {},
    longTerm: {},
    actionLog: [],
    conversations: []
};

export class MemoryService {
    private db: any;
    private dataDir: string;

    private constructor() {
        this.dataDir = path.join(process.cwd(), 'data');
    }

    static async init() {
        const instance = new MemoryService();
        // Ensure data directory exists
        if (!fs.existsSync(instance.dataDir)) {
            fs.mkdirSync(instance.dataDir, { recursive: true });
        }

        const dbPath = path.join(instance.dataDir, 'memory.json');
        instance.db = await JSONFilePreset<MemoryData>(dbPath, defaultData);
        return instance;
    }

    // --- Knowledge (Long Term) ---
    async remember(key: string, value: string) {
        await this.db.update((data: MemoryData) => {
            data.longTerm[key] = value;
        });
        return { status: 'success', key, message: 'Memory stored.' };
    }

    async recall(key: string) {
        const value = this.db.data.longTerm[key];
        if (!value) return { status: 'not_found', key, message: 'No memory found for this key.' };
        return { status: 'success', key, value };
    }

    async getAllLongTermMemories() {
        return this.db.data.longTerm;
    }

    // --- Action History ---
    async logAction(operation: any, result: any, sessionId?: string) {
        const entry: ActionLogEntry = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            timestamp: Date.now(),
            sessionId,
            operation,
            result
        };
        await this.db.update((data: MemoryData) => {
            data.actionLog.push(entry);
        });
    }

    async getRecentActions(limit: number = 10) {
        return this.db.data.actionLog.slice(-limit);
    }

    // --- Conversation History ---
    async addMessage(role: 'user' | 'assistant', content: string, sessionId?: string) {
        const entry: ConversationEntry = {
            id: Date.now().toString(36),
            timestamp: Date.now(),
            role,
            content,
            sessionId
        };
        await this.db.update((data: MemoryData) => {
            data.conversations.push(entry);
        });
    }

    async getRecentConversation(limit: number = 10) {
        return this.db.data.conversations.slice(-limit);
    }
}
