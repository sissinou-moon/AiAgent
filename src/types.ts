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
    z.object({
        op: z.literal('semantic_search'),
        query: z.string().describe('Query to search for files by meaning/context'),
    }),
    z.object({
        op: z.literal('generate_template'),
        templateName: z.string().describe('Name of the template (e.g., "express-api", "react-component")'),
        targetDir: z.string().describe('Directory to generate the template in'),
        variables: z.record(z.string(), z.string()).optional().describe('Key-value pairs for template variables'),
    }),
    z.object({
        op: z.literal('index_files'),
        force: z.boolean().optional().describe('Whether to force a full re-index'),
    }),
    z.object({
        op: z.literal('plan_proposal'),
        planName: z.string().describe('Title of the plan'),
        steps: z.array(z.string()).describe('Sequential steps to be performed'),
        complexity: z.enum(['low', 'medium', 'high']),
    }),
]);

export type FileOperation = z.infer<typeof FileOperationSchema>;

// Agent response schema
export const AgentResponseSchema = z.object({
    thought: z.string().describe('Your internal reasoning and planning.'),
    message: z.string().optional().describe('Direct communication or answer to the user.'),
    operations: z.array(FileOperationSchema).describe('List of operations to execute'),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;
