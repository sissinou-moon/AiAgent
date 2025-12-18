import dotenv from 'dotenv';

dotenv.config();

const HF_API_URL = 'https://router.huggingface.co/nebius/v1/embeddings';

export async function generateEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.HF_TOKEN;
    if (!apiKey) {
        throw new Error('HF_TOKEN is not set in environment variables.');
    }

    const payload = {
        model: "Qwen/Qwen3-Embedding-8B",
        input: text
    };

    try {
        const response = await fetch(HF_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Hugging Face API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const embedding = data.data?.[0]?.embedding;

        if (!embedding) {
            throw new Error('Hugging Face returned empty embedding.');
        }

        return embedding;
    } catch (error) {
        console.error('Embedding Generation Failed:', error);
        throw error;
    }
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.HF_TOKEN;
    if (!apiKey) {
        throw new Error('HF_TOKEN is not set in environment variables.');
    }

    const payload = {
        model: "Qwen/Qwen3-Embedding-8B",
        input: texts
    };

    try {
        const response = await fetch(HF_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Hugging Face API Batch Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return data.data.map((e: any) => e.embedding);
    } catch (error) {
        console.error('Batch Embedding Generation Failed:', error);
        throw error;
    }
}
