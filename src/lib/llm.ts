import { AgentResponse, AgentResponseSchema } from '../types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'xiaomi/mimo-v2-flash:free'; // Using a free model as requested

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export async function callLLM(messages: LLMMessage[], retryCount: number = 0, model: string = DEFAULT_MODEL): Promise<AgentResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is not set in environment variables.');
    }

    const payload = {
        model,
        messages,
        response_format: { type: 'json_object' }, // Force JSON mode
    };

    try {
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://github.com/Start-Loop/AiAgent', // Required by OpenRouter for free tier
                'X-Title': 'AiAgent FS Controller',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenRouter API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (!content) {
            throw new Error('LLM returned empty content.');
        }

        try {
            const json = JSON.parse(content);
            // Validate against our schema
            return AgentResponseSchema.parse(json);
        } catch (parseError) {
            console.error('Failed to parse LLM response as valid JSON:', content);

            if (retryCount < 3) {
                console.log(`Retrying LLM call (Attempt ${retryCount + 1}/3) due to validation error: ${parseError}`);
                const errorMessage = `Your previous response was invalid. Error: ${parseError instanceof Error ? parseError.message : String(parseError)}. Please correct your JSON format and ensure it matches the schema strictly.`;

                const newMessages = [
                    ...messages,
                    { role: 'assistant', content } as LLMMessage,
                    { role: 'user', content: errorMessage } as LLMMessage
                ];

                return callLLM(newMessages, retryCount + 1);
            }

            throw new Error(`Invalid JSON response from LLM after retires: ${parseError}`);
        }

    } catch (error) {
        console.error('LLM Call Failed:', error);
        throw error;
    }
}
