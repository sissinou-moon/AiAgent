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
        // We will now call a looped version
        const result = await AgentService.runAutonomous(body.task, body.max_turns, body.history as any, body.sandboxPath);
        res.json(result);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation Error', details: (error as any).errors });
        } else {
            console.error(error);
            res.status(500).json({ error: error.message || 'Internal Server Error' });
        }
    }
});

export default router;
