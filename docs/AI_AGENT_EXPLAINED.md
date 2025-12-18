# 🤖 AI Agent Project: Full Technical Explanation

Welcome to the comprehensive guide for the **AiAgent** project! This document explains how this advanced file-system controller works, how it remembers, and the critical engineering decisions that make it robust.

---

## 🏗️ Project Architecture Overview

This project is a **Node.js + TypeScript** application that acts as an intelligent layer between a Large Language Model (LLM) and a local file system. It is designed to be **autonomous**, **safe**, and **self-correcting**.

### 🗺️ System Map
| Component | Responsibility | Key File |
| :--- | :--- | :--- |
| **The Brain** | Orchestrates turns, plans tasks, and handles logic loops. | `agent.service.ts` |
| **The Executor** | Safely interacts with the file system (Sandbox). | `sandbox.ts` |
| **The Memory** | Persists history, logs actions, and stores facts. | `memory.ts` |
| **The Link** | Communication gateway to OpenRouter (LLM). | `llm.ts` |

---

## 🧠 How the AI Agent Works (Step-by-Step)

The agent operates on an **Autonomous Loop** principle. It doesn't just "answer"; it "acts".

### 🔄 The Execution Loop
1.  **User Input**: User sends a request (e.g., "Organize my source code").
2.  **Context Retrieval**: The `MemoryService` fetches the last 10 chat messages, the last 10 file operations, and any "remembered" facts.
3.  **Planning (LLM)**: The LLM receives the request + context. It returns a **JSON object** containing:
    *   `thought`: Why it's doing what it's doing.
    *   `operations`: A list of steps (read, write, move, etc.).
4.  **Execution**: The `AgentService` iterates through each operation and calls `executeOperation`.
5.  **Feedback Loop**: The results of these operations (Success/Failure) are fed back into the history.
6.  **Next Turn**: The agent checks if the task is done. If not, it starts Turn 2 with the knowledge of what happened in Turn 1.

---

## 💾 Memory Mechanism: How it Remembers

The agent has three layers of memory managed by `MemoryService` using a JSON-based database (`lowdb`).

### 1. 🗨️ Conversation History
It stores every message exchanged. This allows the agent to understand relative terms like *"Do it again"* or *"What did I just say?"*.

### 2. 📋 Action Logs (The most critical!)
Every single file operation (e.g., `write`, `delete`) is logged with its timestamp and result.
*   **Why?** This prevents the agent from repeating failed actions and helps it "see" the state of the sandbox without listing files every time.

### 3. 🧠 Long-Term Knowledge (Facts)
The agent can explicitly store facts using the `remember` operation.
*   **Example**: `{"op": "remember", "key": "project_name", "value": "Sissinou"}`.
*   Next time, it can `recall("project_name")` to retrieve that specific fact.

---

## 🛠️ Key Functions & Their Logic

### `executeOperation(op)`
The gatekeeper of the file system.
*   **Step 1**: Validates the path using `resolveSafePath` (Security).
*   **Step 2**: Performs fuzzy matching if a file path has special characters (Quotes).
*   **Step 3**: Executes the native `fs` command (using `fs-extra`).
*   **Step 4**: Returns a status report of the action.

### `callLLM(messages)`
The bridge to the AI.
*   **Enforcement**: It forces `json_object` mode.
*   **Validation**: It uses `Zod` (schema validation) to ensure the AI's response is perfectly formatted JSON.
*   **Auto-Correction**: If the AI returns broken JSON, this function automatically sends the error back to the AI and asks for a fix (up to 3 retries).

---

## ⚠️ Critical Modifications & Impact

We implemented several "Advanced Agent" features that significantly improve performance:

| Feature | Modification | Impact on Output |
| :--- | :--- | :--- |
| **Smart Path Lookup** | `findPathWithLooseQuotes` | Prevents errors when the AI uses different quote styles (`'test.txt'` vs `"test.txt"`) or when users copy-paste weird filenames. |
| **Bulk Operations** | `move_all` operation | Instead of moving 100 files one-by-one (which takes 100 API calls/turns), the agent does it in **one** turn. 🚀 |
| **Windows Locking Fix** | `EBUSY` Retry Logic | Windows often locks files being read. The agent now pauses for 500ms and retries if a file is busy, preventing crashes. |
| **Sandbox Security** | `resolveSafePath` | Ensures the AI cannot accidentally (or maliciously) delete your system files or access your Desktop. It's locked in the `sandbox/` folder. |

---

## 💡 Suggestions for "God Mode" Agent

To make your AI agent even more powerful, consider these updates:

1.  **🔍 Vector Search (RAG)**
    *   *Why*: Currently, `list` is too slow for huge projects.
    *   *Improvement*: Create embeddings of all files and let the agent search by "meaning" rather than just filenames.
2.  **🧩 Component Scaffolding Templates**
    *   *Why*: Manual `write` operations often miss boilerplate code.
    *   *Improvement*: Add a `generate_template` operation that uses pre-defined high-quality code structures.
3.  **🌿 Git Integration**
    *   *Why*: The agent currently has no "Undo" for complex changes.
    *   *Improvement*: Let the agent `git commit` before risky operations so it can `git reset` if it makes a mistake.
4.  **⚡ Parallel Execution**
    *   *Why*: Executing operations one-by-one is slow.
    *   *Improvement*: Modify the loop to run independent operations (like writing 3 separate files) simultaneously.
5.  **📺 Terminal Access (Shell)**
    *   *Why*: The agent can't run the code it writes (e.g., `npm install`).
    *   *Improvement*: Add an `exec_command` operation to run terminal commands safely inside the sandbox.

---

> **Note**: This agent is designed to be a "Software Engineer's Assistant". It thrives best when given clear high-level goals! 🚀
