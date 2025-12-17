# AI Agent File System API

This is a high-performance Node.js + TypeScript API that implements an AI agent capable of safe file management.
It uses OpenRouter (defaulting to free models) to reason about tasks and outputs JSON operations executed by a sandboxed backend.

## Setup

1.  **Install dependencies**:
    ```bash
    npm install
    # or if strictly on this windows machine:
    # npm.cmd install
    ```

2.  **Environment Variables**:
    Copy `.env.example` to `.env` and set your OpenRouter API Key.
    ```bash
    cp .env.example .env
    ```
    Add your key: `OPENROUTER_API_KEY=your_key`

3.  **Run the Server**:
    ```bash
    npm start
    ```

## Usage

Send a POST request to `http://localhost:3000/task`:

```json
{
  "task": "Create a file named hello.txt with 'Hello World' content"
}
```

## Architecture

-   **`src/agent.ts`**: Core agent logic (System Prompt -> LLM -> JSON -> Execute).
-   **`src/lib/sandbox.ts`**: Safe filesystem operations (path validation, execution).
-   **`src/lib/llm.ts`**: OpenRouter API client.
-   **`src/server.ts`**: Fastify API server.

## Security

-   All file operations are restricted to the `sandbox` directory (or configured `SANDBOX_ROOT`).
-   Path traversal (`../`) is blocked by `resolveSafePath` logic.
