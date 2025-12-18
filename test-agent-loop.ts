import { AgentService } from './src/services/agent.service';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
    console.log("Testing Agent Loop Early Termination...");
    const task = "Just say hello and finish. Do not do anything else.";
    const result = await AgentService.runAutonomous(task, 5);

    console.log("\nResults:");
    console.log("Turns executed:", result.turns_executed);
    console.log("Final message:", result.final_message);

    if (result.turns_executed < 5) {
        console.log("\nSUCCESS: Agent stopped early as expected.");
    } else {
        console.log("\nFAILURE: Agent used all turns.");
    }
}

test();
