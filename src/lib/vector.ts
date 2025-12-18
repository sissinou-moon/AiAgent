import { JSONFilePreset } from 'lowdb/node';
import path from 'path';
import fs from 'fs-extra';
import { generateEmbedding } from './embeddings';

export interface VectorEntry {
    path: string;
    embedding: number[];
    metadata: {
        lastModified: number;
        hash?: string;
    };
}

export interface VectorStoreData {
    entries: VectorEntry[];
}

const defaultData: VectorStoreData = {
    entries: []
};

export class VectorStore {
    private db: any;
    private dbPath: string;

    private constructor() {
        this.dbPath = path.join(process.cwd(), 'data', 'vectors.json');
    }

    static async init() {
        const instance = new VectorStore();
        const dataDir = path.dirname(instance.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        instance.db = await JSONFilePreset<VectorStoreData>(instance.dbPath, defaultData);
        return instance;
    }

    async upsert(entry: VectorEntry) {
        await this.db.update((data: VectorStoreData) => {
            const index = data.entries.findIndex(e => e.path === entry.path);
            if (index !== -1) {
                data.entries[index] = entry;
            } else {
                data.entries.push(entry);
            }
        });
    }

    async search(query: string, limit: number = 5): Promise<{ path: string; score: number }[]> {
        const queryEmbedding = await generateEmbedding(query);
        const entries = this.db.data.entries;

        const results = entries.map((entry: VectorEntry) => ({
            path: entry.path,
            score: this.cosineSimilarity(queryEmbedding, entry.embedding)
        }));

        return results
            .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
            .slice(0, limit);
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    async remove(filePath: string) {
        await this.db.update((data: VectorStoreData) => {
            data.entries = data.entries.filter(e => e.path !== filePath);
        });
    }

    async clear() {
        await this.db.update((data: VectorStoreData) => {
            data.entries = [];
        });
    }
}
