import { AgentResponse, AgentResponseSchema } from '../types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'xiaomi/mimo-v2-flash:free'; // Using DeepSeek R1 (free version if available) as it has native reasoning

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface StreamChunk {
    type: 'thought' | 'message' | 'reasoning' | 'done';
    content?: string;
    fullResponse?: AgentResponse;
}

/**
 * Cleans the LLM output to extract a valid JSON string.
 */
function cleanJSON(content: string): string {
    let cleaned = content.replace(/```json\s?([\s\S]*?)```/g, '$1');
    cleaned = cleaned.replace(/```\s?([\s\S]*?)```/g, '$1');
    return cleaned.trim();
}

export async function callLLM(messages: LLMMessage[], retryCount: number = 0, model: string = DEFAULT_MODEL): Promise<AgentResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is not set in environment variables.');
    }

    const payload = {
        model,
        messages,
        response_format: { type: 'json_object' },
    };

    try {
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://github.com/Start-Loop/AiAgent',
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

        const cleanedContent = cleanJSON(content);

        try {
            const json = JSON.parse(cleanedContent);
            const parsed = AgentResponseSchema.parse(json);
            if (data.usage) {
                parsed.usage = data.usage;
            }
            return parsed;
        } catch (parseError) {
            if (retryCount < 3) {
                const errorMessage = `Your previous response was invalid JSON. Error: ${parseError instanceof Error ? parseError.message : String(parseError)}. Please ensure you return valid JSON.`;
                return callLLM([...messages, { role: 'assistant', content }, { role: 'user', content: errorMessage }], retryCount + 1);
            }
            throw new Error(`Invalid JSON response after retries: ${parseError}`);
        }
    } catch (error) {
        console.error('LLM Call Failed:', error);
        throw error;
    }
}

export async function* callLLMStream(messages: LLMMessage[], model: string = DEFAULT_MODEL): AsyncGenerator<StreamChunk> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is not set.');
    }

    const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/Start-Loop/AiAgent',
            'X-Title': 'AiAgent FS Controller',
        },
        body: JSON.stringify({
            model,
            messages,
            stream: true,
            stream_options: { include_usage: true },
            // DeepSeek R1 on OpenRouter supports reasoning tokens which are often sent in a separate field or before content
            include_reasoning: true
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API Error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is empty');

    const decoder = new TextDecoder();
    let accumulatedContent = '';
    let accumulatedReasoning = '';
    let usage: any = undefined;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr);
                    const delta = data.choices[0]?.delta;

                    if (delta?.reasoning) {
                        accumulatedReasoning += delta.reasoning;
                        yield { type: 'reasoning', content: delta.reasoning };
                    }

                    if (delta?.content) {
                        accumulatedContent += delta.content;
                        // We yield 'message' for the content stream
                        yield { type: 'message', content: delta.content };
                    }
                    if (data.usage) {
                        usage = data.usage;
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    }

    // After stream ends, try to parse the whole content as JSON if it's supposed to be an AgentResponse
    try {
        const cleaned = cleanJSON(accumulatedContent);
        const json = JSON.parse(cleaned);
        const parsed = AgentResponseSchema.parse(json);
        if (usage) {
            parsed.usage = usage;
        }
        yield { type: 'done', fullResponse: parsed };
    } catch (e) {
        // If it's not valid JSON, we still yield done but without fullResponse
        yield { type: 'done' };
    }
}
