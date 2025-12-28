import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AgentService } from '../services/agent.service';

const router = Router();

const TaskSchema = z.object({
    task: z.string().min(1),
    max_turns: z.number().int().min(1).max(50).optional().default(1),
    sandboxPath: z.string().optional(),
    history: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string()
    })).optional()
});

router.post('/task', async (req: Request, res: Response) => {
    try {
        const body = TaskSchema.parse(req.body);
        const result = await AgentService.runAutonomous(body.task, body.max_turns, body.history as any, body.sandboxPath);
        res.json(result);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation Error', details: error.issues });
        } else {
            res.status(500).json({ error: error.message || 'Internal Server Error' });
        }
    }
});

router.post('/task/stream', async (req: Request, res: Response) => {
    try {
        const body = TaskSchema.parse(req.body);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const stream = AgentService.runAutonomousStream(
            body.task,
            body.max_turns,
            body.history as any,
            body.sandboxPath
        );

        for await (const event of stream) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }

        res.end();
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation Error', details: error.issues });
        } else {
            console.error(error);
            if (!res.headersSent) {
                res.status(500).json({ error: error.message || 'Internal Server Error' });
            } else {
                res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
                res.end();
            }
        }
    }
});

export default router;
