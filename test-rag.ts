import { AgentService } from './src/services/agent.service';
import { VectorStore } from './src/lib/vector';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'path';

dotenv.config();

async function test() {
    console.log("Testing Indexing and RAG...");

    // Create a dummy file in sandbox to index
    const sandboxRoot = process.env.SANDBOX_ROOT || './sandbox';
    const testFile = path.join(sandboxRoot, 'rag-test.txt');
    await fs.ensureDir(sandboxRoot);
    await fs.writeFile(testFile, "The secret password is 'ANTIGRAVITY'. This file is for RAG testing.");
    console.log("Test file created.");

    // Trigger indexing
    console.log("Triggering indexing...");
    const result = await AgentService.runAutonomous("Index all files in the sandbox.", 1);
    console.log("Indexing result status:", result.status);

    // Verify vectors.json
    const vectorsPath = path.join(process.cwd(), 'data', 'vectors.json');
    if (await fs.pathExists(vectorsPath)) {
        const vectors = await fs.readJson(vectorsPath);
        console.log("Vectors found. Count:", vectors.entries.length);

        // Search
        console.log("Searching for 'secret password'...");
        const store = await VectorStore.init();
        const matches = await store.search("secret password");
        console.log("Search results:", JSON.stringify(matches, null, 2));
    } else {
        console.log("FAILURE: vectors.json not found.");
    }
}

test();
