import { generateEmbedding, generateEmbeddingsBatch } from './src/lib/embeddings';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
    console.log("Testing Single Embedding...");
    try {
        const embedding = await generateEmbedding("Hello world");
        console.log("Single embedding generated. Length:", embedding.length);
        console.log("First 5 values:", embedding.slice(0, 5));
    } catch (e) {
        console.error("Single embedding failed:", e);
    }

    console.log("\nTesting Batch Embeddings...");
    try {
        const embeddings = await generateEmbeddingsBatch(["Hello", "World"]);
        console.log("Batch embeddings generated. Count:", embeddings.length);
        console.log("First embedding length:", embeddings[0].length);
    } catch (e) {
        console.error("Batch embedding failed:", e);
    }
}

test();
