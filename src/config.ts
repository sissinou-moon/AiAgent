import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Define the sandbox root. 
// In a real app, this might be dynamic per user or session.
// For this standalone agent, we default to a 'sandbox' directory in the project root.
export const PROJECT_ROOT = process.cwd();
export const SANDBOX_ROOT = process.env.SANDBOX_ROOT
    ? path.resolve(process.env.SANDBOX_ROOT)
    : path.join(PROJECT_ROOT, 'sandbox');

// Ensure sandbox exists
if (!fs.existsSync(SANDBOX_ROOT)) {
    fs.mkdirSync(SANDBOX_ROOT, { recursive: true });
    console.log(`Created sandbox directory at ${SANDBOX_ROOT}`);
} else {
    console.log(`Using sandbox directory at ${SANDBOX_ROOT}`);
}
