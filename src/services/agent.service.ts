import { callLLM, LLMMessage } from '../lib/llm';
import { executeOperation } from '../lib/sandbox';
import { AgentResponse } from '../types';
import { MemoryService } from '../lib/memory';
import { performSpecializedSearch } from '../lib/web';
import { SANDBOX_ROOT } from '../config';

const SYSTEM_PROMPT = `
You are an advanced AI file system agent. Your goal is to fulfill the user's request by performing file system operations.
You operate within a sandboxed directory. You cannot access files outside this sandbox.

You must reply with a strictly valid JSON object adhering to the following structure:
{
  "thought": "Your reasoning process here. Analyze the request and plan the steps.",
  "operations": [
    { "op": "write", "path": "path/to/file", "content": "file content" },
    { "op": "read", "path": "path/to/file" },
    { "op": "mkdir", "path": "path/to/dir" },
    { "op": "delete", "path": "path/to/file_or_dir" },
    { "op": "list", "path": "path/to/dir", "pattern": "optional_search_term" },
    { "op": "move", "from": "source", "to": "dest" },
    { "op": "copy", "from": "source", "to": "dest" },
    { "op": "remember", "key": "topic", "value": "fact" },
    { "op": "recall", "key": "topic" },
    { "op": "web_search", "query": "search query" },
    { "op": "move_all", "path": ".", "destination": "target_folder", "extensions": [".pdf", ".docx"] }
  ]
}

- "thought": Explain WHY you are doing these operations.
- "operations": An array of operations to execute in order.

=== PROJECT PLANNING PROTOCOL ===
If the user asks for a "project structure", "plan", or "blueprint", you MUST immediately create a Markdown file named "[Project Name] Plan.md".
Use exactly this structure for the file content:

# [Project Name] Plan

## 1. Description
[Detailed description of what is being built]

## 2. Tools & Stack
- [Tool 1]
- [Tool 2]

## 3. Execution Plan
[High-level strategy]

## 4. Steps
1. [Step 1]
2. [Step 2]

## 5. Cost Analysis
[Estimated resources or API costs if applicable]

## 6. Workflow Context
**Previous Step:** [What was done before this plan?]
**Next Step:** [What is the immediate action after this plan?]

## 7. Data/Resources
[Tables or strict data structures if needed]
---

=== BULK OPERATIONS PROTOCOL ===
- IF user asks to move/copy all files of a certain type (e.g. "move all pdfs"):
    1.  YOU MUST NOT LIST FILES.
    2.  YOU MUST NOT MOVE FILES ONE BY ONE.
    3.  YOU MUST USE \`move_all\` IMMEDIATELY.

Example:
User: "Move all pdfs to PDFS folder"
Response: { "thought": "Moving all pdfs using move_all", "operations": [{ "op": "move_all", "path": ".", "destination": "PDFS", "extensions": [".pdf"] }] }

Constraints:
- Use only the allowed operations.
- All paths are relative to the sandbox root.
- Do not make assumptions about file content unless you read it or created it.
- If the user asks to create a project, scaffolding it step-by-step is preferred.
- Only return JSON. Do not include markdown formatting (like \`\`\`json).
`;

export class AgentService {
    static async runAutonomous(task: string, maxTurns: number = 1, history: LLMMessage[] = []): Promise<any> {
        let currentHistory = [...history];
        let aggregatedResults = [];
        let currentTask = task;

        for (let i = 0; i < maxTurns; i++) {
            console.log(`\n=== Turn ${i + 1}/${maxTurns} ===`);

            // Execute one turn
            const result = await this.processTask(currentTask, currentHistory);
            aggregatedResults.push({ turn: i + 1, ...result });

            // Stop if error or empty results
            if (result.status === 'error' || !result.results || result.results.length === 0) {
                break;
            }

            // FEEDBACK LOOP: 
            // We must add the assistant's action AND the tool's output to the 'currentHistory' 
            // so the next turn sees what happened.
            // 'processTask' adds to DB memory, BUT for the *immediate* next turn in this loop, 
            // we need to make sure the LLM context includes the tool output we just got.

            // 1. Add Assistant Thought/Action
            currentHistory.push({
                role: 'assistant',
                content: JSON.stringify({ thought: result.thought, operations: result.results.map((r: any) => ({ op: r.op, path: r.path })) })
            });

            // 2. Add System/Tool Output (simulate the user pasting the result)
            // In a real agent loop, this is the "System" role or "Tool" role response.
            // Here we verify what the tool returned.
            const toolOutput = JSON.stringify(result.results);
            currentHistory.push({
                role: 'user', // Or 'system' if supported, playing it safe with 'user' for now as "System Output"
                content: `Operation Results: ${toolOutput}\n\nProceed with the next step.`
            });

            // If looping, keep the task prompt simple
            if (i < maxTurns - 1) {
                currentTask = "Continue. Check the 'Operation Results' above and execute the next logical step.";
            }
        }

        const isDone = aggregatedResults.length < maxTurns || aggregatedResults[aggregatedResults.length - 1].results.length === 0;

        return {
            status: 'success',
            turns_executed: aggregatedResults.length,
            final_message: isDone ? "Task completed successfully. I'm done!" : "Max turns reached. Request more turns to continue.",
            history: aggregatedResults
        };
    }

    static async processTask(task: string, history: LLMMessage[] = []): Promise<any> {
        // Initialize Memory
        const memory = await MemoryService.init();

        // 1. Retrieve Context
        const longTermMemory = await memory.getAllLongTermMemories();
        const recentActions = await memory.getRecentActions(10);
        const recentChat = await memory.getRecentConversation(10);

        // Prepare context strings
        const memoriesStr = JSON.stringify(longTermMemory, null, 2);
        const actionsStr = JSON.stringify(recentActions.map((a: any) => {
            const summary: any = { op: a.operation.op, path: a.operation.path, status: 'success' };
            if (a.operation.op === 'list' && a.result.files) {
                // Severe truncation for large directories to keep context clear
                const fileCount = a.result.files.length;
                summary.files = fileCount > 20 ? a.result.files.slice(0, 20).concat([`...and ${fileCount - 20} more`]) : a.result.files;
            }
            if (a.result.moved) summary.moved_count = a.result.moved.length;
            if (a.result.error) summary.error = a.result.error;
            return summary;
        }), null, 2);
        const chatStr = recentChat.map((c: any) => `${c.role.toUpperCase()}: ${c.content}`).join('\n');

        // Enhanced System Prompt
        const ENHANCED_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

=== OPERATIONAL CONTEXT ===
**Current Sandbox Root**: \`${SANDBOX_ROOT}\`
(The agent effectively "lives" here. If this is a restricted folder, you cannot leave it. If it is the system root, you have full access.)

=== MEMORY CONTEXT ===
[Long-Term Knowledge]
${memoriesStr}

[Recent Conversation History]
${chatStr}

[Recent Actions Performed]
${actionsStr}

IMPORTANT: If the user says "forget X" or "focus on Y", you MUST ignore conflicting information from the [Recent Conversation History] about X.
Currently, the user is focused on: **Desktop/ActelChatbot**. Do NOT reference 'Downloads' unless explicitly asked again.

Use this history to:
1. "Undo" previous actions if requested (by performing the inverse operation).
2. Answer questions about what you did previously.
3. Don't repeat successful actions unnecessarily.
`;

        // Log the new user task
        await memory.addMessage('user', task);

        // Construct messages
        const messages: LLMMessage[] = [
            { role: 'system', content: ENHANCED_SYSTEM_PROMPT },
            // We rely on our internal DB history mostly, but keep passed history if needed for immediate context
            ...history,
            { role: 'user', content: task }
        ];

        console.log(`Processing task: ${task}`);

        try {
            // 1. Plan and Decide
            const agentResponse: AgentResponse = await callLLM(messages);

            console.log(`Agent Thought: ${agentResponse.thought}`);
            await memory.addMessage('assistant', JSON.stringify(agentResponse));

            // 2. Execute Operations
            const results = [];
            for (const op of agentResponse.operations) {
                console.log(`Executing op: ${op.op}`);

                let result;
                if (op.op === 'remember') {
                    result = await memory.remember(op.key, op.value);
                } else if (op.op === 'recall') {
                    result = await memory.recall(op.key);
                } else if (op.op === 'web_search') {
                    result = await performSpecializedSearch(op.query);
                    // Log search result to memory context for next turn?
                    // Yes, we should probably add it to conversation immediately or reliance on action log.
                    // The action log will capture it.
                } else {
                    // File Operations
                    result = await executeOperation(op as any);
                }

                // For web search or memory ops, we should also log to action log if we want full trace?
                if (op.op !== 'write' && op.op !== 'delete' && op.op !== 'mkdir' && op.op !== 'move' && op.op !== 'copy') {
                    await memory.logAction(op, result);
                } else {
                    // Log file operations to Action Log
                    await memory.logAction(op, result);
                }

                results.push(result);
            }

            return {
                thought: agentResponse.thought,
                results: results
            };

        } catch (error: any) {
            console.error("Agent Error:", error);
            throw error; // Re-throw to be handled by controller/middleware
        }
    }
}
