import { z } from 'zod';

// Base schema for file system operations
export const FileOperationSchema = z.discriminatedUnion('op', [
    z.object({
        op: z.literal('write'),
        path: z.string().describe('Relative path to the file'),
        content: z.string().describe('Content to write to the file'),
    }),
    z.object({
        op: z.literal('read'),
        path: z.string().describe('Relative path to the file to read'),
    }),
    z.object({
        op: z.literal('mkdir'),
        path: z.string().describe('Relative path to the directory to create'),
    }),
    z.object({
        op: z.literal('delete'),
        path: z.string().describe('Relative path to the file or directory to delete'),
    }),
    z.object({
        op: z.literal('move'),
        from: z.string().describe('Relative path of the source'),
        to: z.string().describe('Relative path of the destination'),
    }),
    z.object({
        op: z.literal('copy'),
        from: z.string().describe('Relative path of the source'),
        to: z.string().describe('Relative path of the destination'),
    }),
    z.object({
        op: z.literal('list'),
        path: z.string().describe('Relative path to the directory to list'),
        pattern: z.string().optional().describe('Optional glob pattern or substring to filter files (e.g. "*.pdf" or "folder_name")'),
    }),
    z.object({
        op: z.literal('remember'),
        key: z.string().describe('Key/Topic for the memory (e.g., "user_preference", "project_goal")'),
        value: z.string().describe('Information to remember'),
    }),
    z.object({
        op: z.literal('recall'),
        key: z.string().describe('Key/Topic to recall'),
    }),
    z.object({
        op: z.literal('web_search'),
        query: z.string().describe('Query to search on the web'),
    }),
    z.object({
        op: z.literal('move_all'),
        path: z.string().describe('Source directory to filter files from (usually ".")'),
        destination: z.string().describe('Destination directory'),
        extensions: z.array(z.string()).describe('File extensions to move (e.g. [".pdf", ".mp3"])'),
    }),
]);

export type FileOperation = z.infer<typeof FileOperationSchema>;

// Agent response schema
export const AgentResponseSchema = z.object({
    thought: z.string().describe('Reasoning behind the operations'),
    operations: z.array(FileOperationSchema).describe('List of operations to execute'),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;
