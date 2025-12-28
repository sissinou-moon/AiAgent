import { callLLM, callLLMStream, LLMMessage, StreamChunk } from '../lib/llm';
import { executeOperation } from '../lib/sandbox';
import { AgentResponse, FileOperation } from '../types';
import { MemoryService } from '../lib/memory';
import { performSpecializedSearch } from '../lib/web';
import { SANDBOX_ROOT } from '../config';
import { VectorStore } from '../lib/vector';
import { TemplateService } from '../lib/templates';
import { generateEmbedding } from '../lib/embeddings';
import path from 'path';
import fs from 'fs-extra';

const SYSTEM_PROMPT = `
You are an ELITE AI Software Engineer and file system agent with ADVANCED REASONING capabilities. 

OPERATIONAL PROTOCOLS:
1. **DEEP THINKING**: Before every action, you must engage in deep reasoning. Analyze the task, consider edge cases, and plan the most efficient implementation.
2. **PLAN BEFORE EXECUTE**: For any task involving more than 2 files or complex logic, you MUST first use the \`plan_proposal\` operation.
3. **PARALLEL MINDSET**: You can execute multiple independent operations at once. Group them in the \`operations\` array.
4. **QUALITY FIRST**: 
   - Follow DRY (Don't Repeat Yourself) and SOLID principles.
   - Write clean, documented, and idiomatic code.
   - Reference best practices for the specific language/framework requested.
5. **SEMANTIC SEARCH**: Use \`semantic_search\` when you need to find code by functionality rather than just filename.
6. **FINISH**: When you have completed the user's request, return an empty \`operations\` array or a final \`thought\` indicating completion.
7. **JSON FORMATTING**: CRITICAL: Your entire response MUST be a single, valid JSON object. Escape all newlines in string values as \`\\n\`.

JSON RESPONSE FORMAT:
{
  "thought": "Your internal reasoning and planning.",
  "message": "Direct answer or communication for the user.",
  "operations": [
    { "op": "plan_proposal", "planName": "Setup API", "steps": ["...", "..."], "complexity": "medium" },
    { "op": "write", "path": "path", "content": "..." }
  ]
}

Available Operations: write, read, mkdir, delete, list, move, copy, remember, recall, web_search, move_all, semantic_search, generate_template, index_files, plan_proposal.
`;

export class AgentService {
    static async *runAutonomousStream(task: string, maxTurns: number = 3, history: LLMMessage[] = [], sandboxPath?: string): AsyncGenerator<any> {
        let currentHistory = [...history];
        let aggregatedResults = [];
        let currentTask = task;

        const memory = await MemoryService.init();
        const vectorStore = await VectorStore.init();

        for (let i = 0; i < maxTurns; i++) {
            yield { type: 'turn_start', turn: i + 1 };

            const longTermMemory = await memory.getAllLongTermMemories();
            const recentActions = await memory.getRecentActions(10);
            const recentChat = await memory.getRecentConversation(10);

            const messages: LLMMessage[] = [
                { role: 'system', content: this.getEnhancedPrompt(longTermMemory, recentActions, recentChat, sandboxPath) },
                ...currentHistory,
                { role: 'user', content: currentTask }
            ];

            let lastResponse: AgentResponse | undefined;

            for await (const chunk of callLLMStream(messages)) {
                if (chunk.type === 'reasoning') {
                    yield { type: 'thinking', content: chunk.content };
                } else if (chunk.type === 'message') {
                    yield { type: 'chunk', content: chunk.content };
                } else if (chunk.type === 'done' && chunk.fullResponse) {
                    lastResponse = chunk.fullResponse;
                }
            }

            if (!lastResponse) {
                yield { type: 'error', message: 'Failed to get valid response from LLM.' };
                break;
            }

            yield { type: 'thought', content: lastResponse.thought };
            yield { type: 'message', content: lastResponse.message };

            if (lastResponse.usage) {
                yield { type: 'usage', content: lastResponse.usage };
            }

            if (lastResponse.operations.length > 0) {
                yield { type: 'operations_start', count: lastResponse.operations.length };
                const results = await this.executeBatch(lastResponse.operations, memory, vectorStore, sandboxPath);
                yield { type: 'operations_results', results };

                // Update history
                currentHistory.push({
                    role: 'assistant',
                    content: JSON.stringify(lastResponse)
                });
                currentHistory.push({
                    role: 'user',
                    content: `Operation Results: ${JSON.stringify(results)}\n\nProceed.`
                });

                currentTask = "Check the 'Operation Results'. Continue if needed, otherwise finish.";
            } else {
                yield { type: 'done', final_message: lastResponse.message || "Task completed." };
                return;
            }
        }

        yield { type: 'done', final_message: "Max turns reached or task completed." };
    }

    static async runAutonomous(task: string, maxTurns: number = 3, history: LLMMessage[] = [], sandboxPath?: string): Promise<any> {
        let currentHistory = [...history];
        let aggregatedResults = [];
        let currentTask = task;

        for (let i = 0; i < maxTurns; i++) {
            const result = await this.processTask(currentTask, currentHistory, sandboxPath);
            aggregatedResults.push({ turn: i + 1, ...result });

            if (result.status === 'error' || !result.results || result.results.length === 0) {
                break;
            }

            currentHistory.push({
                role: 'assistant',
                content: JSON.stringify({
                    thought: result.thought,
                    message: result.message,
                    operations: result.results.map((r: any) => ({ op: r.op, path: r.path || r.from || r.query }))
                })
            });

            currentHistory.push({
                role: 'user',
                content: `Operation Results: ${JSON.stringify(result.results)}\n\nProceed with the next step.`
            });

            if (i < maxTurns - 1) {
                currentTask = "Check the 'Operation Results'. If the task is fully completed, return an empty operations array to finish. Otherwise, execute the next logical step.";
            }
        }

        const isDone = aggregatedResults.length < maxTurns || aggregatedResults[aggregatedResults.length - 1].results.length === 0;

        const totalUsage = aggregatedResults.reduce((acc, turn) => {
            if (turn.usage) {
                acc.prompt_tokens += turn.usage.prompt_tokens;
                acc.completion_tokens += turn.usage.completion_tokens;
                acc.total_tokens += turn.usage.total_tokens;
            }
            return acc;
        }, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });

        return {
            status: 'success',
            turns_executed: aggregatedResults.length,
            final_message: isDone ? "Task completed successfully." : "Max turns reached.",
            total_usage: totalUsage,
            history: aggregatedResults
        };
    }

    static async processTask(task: string, history: LLMMessage[] = [], sandboxPath?: string): Promise<any> {
        const memory = await MemoryService.init();
        const vectorStore = await VectorStore.init();

        const longTermMemory = await memory.getAllLongTermMemories();
        const recentActions = await memory.getRecentActions(10);
        const recentChat = await memory.getRecentConversation(10);

        const messages: LLMMessage[] = [
            { role: 'system', content: this.getEnhancedPrompt(longTermMemory, recentActions, recentChat, sandboxPath) },
            ...history,
            { role: 'user', content: task }
        ];

        try {
            const agentResponse: AgentResponse = await callLLM(messages);
            await memory.addMessage('assistant', JSON.stringify(agentResponse));
            const results = await this.executeBatch(agentResponse.operations, memory, vectorStore, sandboxPath);

            return {
                thought: agentResponse.thought,
                message: agentResponse.message,
                results: results,
                usage: agentResponse.usage
            };

        } catch (error: any) {
            return { status: 'error', error: error.message };
        }
    }

    private static async executeBatch(operations: FileOperation[], memory: MemoryService, vectorStore: VectorStore, sandboxPath?: string): Promise<any[]> {
        return Promise.all(operations.map(async (op) => {
            let result;
            try {
                switch (op.op) {
                    case 'remember':
                        result = await memory.remember(op.key, op.value);
                        break;
                    case 'recall':
                        result = await memory.recall(op.key);
                        break;
                    case 'web_search':
                        result = await performSpecializedSearch(op.query);
                        break;
                    case 'semantic_search':
                        const matches = await vectorStore.search(op.query);
                        result = { status: 'success', matches, op: 'semantic_search' };
                        break;
                    case 'generate_template':
                        const actualTargetDir = op.targetDir ? (sandboxPath ? path.join(sandboxPath, op.targetDir) : path.join(SANDBOX_ROOT, op.targetDir)) : (sandboxPath || SANDBOX_ROOT);
                        const files = await TemplateService.generate(op.templateName, actualTargetDir, op.variables as Record<string, string>);
                        result = { status: 'success', files, op: 'generate_template' };
                        break;
                    case 'plan_proposal':
                        result = { status: 'success', proposal: op, message: "Plan registered. Awaiting approval.", op: 'plan_proposal' };
                        break;
                    case 'index_files':
                        await this.reindexSandbox(vectorStore, sandboxPath);
                        result = { status: 'success', message: "Indexing complete.", op: 'index_files' };
                        break;
                    default:
                        result = await executeOperation(op as any, sandboxPath);
                        if (op.op === 'write') {
                            try {
                                const embedding = await generateEmbedding(op.content);
                                await vectorStore.upsert({ path: op.path, embedding, metadata: { lastModified: Date.now() } });
                            } catch (e) { }
                        }
                }
            } catch (err: any) {
                result = { status: 'error', error: err.message, op: op.op };
            }
            await memory.logAction(op, result);
            return result;
        }));
    }

    private static async reindexSandbox(vectorStore: VectorStore, sandboxPath?: string) {
        const root = sandboxPath || SANDBOX_ROOT;
        if (!fs.existsSync(root)) return;
        const files = await this.getAllFiles(root);
        for (const file of files) {
            try {
                const relativePath = path.relative(root, file);
                const content = await fs.readFile(file, 'utf-8');
                const embedding = await generateEmbedding(content);
                await vectorStore.upsert({ path: relativePath, embedding, metadata: { lastModified: Date.now() } });
            } catch (e) { }
        }
    }

    private static async getAllFiles(dirPath: string): Promise<string[]> {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files = await Promise.all(entries.map((entry) => {
            const res = path.resolve(dirPath, entry.name);
            return entry.isDirectory() ? this.getAllFiles(res) : res;
        }));
        return Array.prototype.concat(...files);
    }

    private static getEnhancedPrompt(memories: any, actions: any, chat: any, sandboxPath?: string): string {
        const activeSandbox = sandboxPath || SANDBOX_ROOT;
        return `${SYSTEM_PROMPT}

=== OPERATIONAL CONTEXT ===
**Sandbox Root**: \`${activeSandbox}\`

=== MEMORY CONTEXT ===
[Recent Actions]
${JSON.stringify(actions.map((a: any) => ({ op: a.operation.op, status: a.result?.status || 'unknown' })), null, 2)}

[Chat History]
${chat.map((c: any) => `${c.role.toUpperCase()}: ${c.content}`).join('\n')}

[Fast Retrieval Knowledge]
${JSON.stringify(memories, null, 2)}
`;
    }
}
