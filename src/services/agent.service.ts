import { callLLM, LLMMessage } from '../lib/llm';
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
You are an ELITE AI Software Engineer and file system agent. 
Your goal is to build high-quality, performant, and clean code systems.

OPERATIONAL PROTOCOLS:
1. **PLAN BEFORE EXECUTE**: For any task involving more than 2 files or complex logic, you MUST first use the \`plan_proposal\` operation.
2. **PARALLEL MINDSET**: You can execute multiple independent operations at once. Group them in the \`operations\` array.
3. **QUALITY FIRST**: 
   - Follow DRY (Don't Repeat Yourself) and SOLID principles.
   - Write clean, documented, and idiomatic code.
   - Reference best practices for the specific language/framework requested.
4. **SEMANTIC SEARCH**: Use \`semantic_search\` when you need to find code by functionality rather than just filename.
5. **SCAFFOLDING**: Use \`generate_template\` for standardized project structures to ensure consistency and quality.
6. **FINISH**: When you have completed the user's request, you MUST return an empty \`operations\` array or a final \`thought\` indicating completion. Do NOT execute unnecessary operations just to fill turns.
7. **PLAN EXECUTION**: If you have previously proposed a plan and the user approves it (e.g., "Looks good", "Proceed"), you MUST immediately start executing the steps of that plan. Do not ask for further instructions if the path forward is already planned and approved.
8. **COMMUNICATION**: Use the \`message\` field to speak directly to the user, provide answers to questions, or summarize what you've done.
9. **JSON FORMATTING**: CRITICAL: Your entire response MUST be a single, valid JSON object. Escape all newlines in string values as \`\\n\`. Do NOT include raw newlines within JSON string values.

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
    static async runAutonomous(task: string, maxTurns: number = 3, history: LLMMessage[] = []): Promise<any> {
        let currentHistory = [...history];
        let aggregatedResults = [];
        let currentTask = task;

        for (let i = 0; i < maxTurns; i++) {
            console.log(`\n=== Turn ${i + 1}/${maxTurns} ===`);

            const result = await this.processTask(currentTask, currentHistory);
            aggregatedResults.push({ turn: i + 1, ...result });

            if (result.status === 'error' || !result.results || result.results.length === 0) {
                break;
            }

            // 1. Add Assistant Action
            currentHistory.push({
                role: 'assistant',
                content: JSON.stringify({
                    thought: result.thought,
                    message: result.message,
                    operations: result.results.map((r: any) => ({ op: r.op, path: r.path || r.from || r.query }))
                })
            });

            // 2. Add System Output
            const toolOutput = JSON.stringify(result.results);
            currentHistory.push({
                role: 'user',
                content: `Operation Results: ${toolOutput}\n\nProceed with the next step.`
            });

            if (i < maxTurns - 1) {
                currentTask = "Check the 'Operation Results'. If the task is fully completed, return an empty operations array to finish. Otherwise, execute the next logical step.";
            }
        }

        const isDone = aggregatedResults.length < maxTurns || aggregatedResults[aggregatedResults.length - 1].results.length === 0;

        return {
            status: 'success',
            turns_executed: aggregatedResults.length,
            final_message: isDone ? "Task completed successfully." : "Max turns reached.",
            history: aggregatedResults
        };
    }

    static async processTask(task: string, history: LLMMessage[] = []): Promise<any> {
        const memory = await MemoryService.init();
        const vectorStore = await VectorStore.init();

        // Retrieve Context
        const longTermMemory = await memory.getAllLongTermMemories();
        const recentActions = await memory.getRecentActions(10);
        const recentChat = await memory.getRecentConversation(10);

        const messages: LLMMessage[] = [
            { role: 'system', content: this.getEnhancedPrompt(longTermMemory, recentActions, recentChat) },
            ...history,
            { role: 'user', content: task }
        ];

        try {
            const agentResponse: AgentResponse = await callLLM(messages);
            await memory.addMessage('assistant', JSON.stringify(agentResponse));

            // EXECUTOR: Parallel processing for independent tasks
            const results = await this.executeBatch(agentResponse.operations, memory, vectorStore);

            return {
                thought: agentResponse.thought,
                message: agentResponse.message,
                results: results
            };

        } catch (error: any) {
            console.error("Agent Error:", error);
            return { status: 'error', error: error.message };
        }
    }

    private static async executeBatch(operations: FileOperation[], memory: MemoryService, vectorStore: VectorStore): Promise<any[]> {
        return Promise.all(operations.map(async (op) => {
            console.log(`Executing op: ${op.op}`);
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
                        const files = await TemplateService.generate(op.templateName, op.targetDir, op.variables as Record<string, string>);
                        result = { status: 'success', files, op: 'generate_template' };
                        break;
                    case 'plan_proposal':
                        result = { status: 'success', proposal: op, message: "Plan registered. Awaiting your approval to proceed with execution or feedback.", op: 'plan_proposal' };
                        break;
                    case 'index_files':
                        await this.reindexSandbox(vectorStore);
                        result = { status: 'success', message: "Indexing complete.", op: 'index_files' };
                        break;
                    default:
                        result = await executeOperation(op as any);
                        // Update index if it's a 'write' operation
                        if (op.op === 'write') {
                            try {
                                const embedding = await generateEmbedding(op.content);
                                await vectorStore.upsert({
                                    path: op.path,
                                    embedding,
                                    metadata: { lastModified: Date.now() }
                                });
                            } catch (e) {
                                console.warn("Failed to update index for write operation:", e);
                            }
                        }
                }
            } catch (err: any) {
                result = { status: 'error', error: err.message, op: op.op };
            }

            await memory.logAction(op, result);
            return result;
        }));
    }

    private static async reindexSandbox(vectorStore: VectorStore) {
        if (!fs.existsSync(SANDBOX_ROOT)) return;
        const files = await this.getAllFiles(SANDBOX_ROOT);
        for (const file of files) {
            try {
                const relativePath = path.relative(SANDBOX_ROOT, file);
                const content = await fs.readFile(file, 'utf-8');
                const embedding = await generateEmbedding(content);
                await vectorStore.upsert({
                    path: relativePath,
                    embedding,
                    metadata: { lastModified: Date.now() }
                });
            } catch (e) {
                console.warn(`Failed to index file ${file}:`, e);
            }
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

    private static getEnhancedPrompt(memories: any, actions: any, chat: any): string {
        return `${SYSTEM_PROMPT}

=== OPERATIONAL CONTEXT ===
**Sandbox Root**: \`${SANDBOX_ROOT}\`

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
