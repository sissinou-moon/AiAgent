import app, { printRoutes } from './app';
import { SANDBOX_ROOT } from './config';

const PORT = parseInt(process.env.PORT || '3000');

const start = async () => {
    try {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🌟 Server running at http://localhost:${PORT}`);
            console.log(`📦 Sandbox Directory: ${SANDBOX_ROOT}`);

            if (!process.env.OPENROUTER_API_KEY) {
                console.warn('\x1b[33m%s\x1b[0m', '⚠️  WARNING: OPENROUTER_API_KEY is not set. agent tasks will fail.');
            }

            printRoutes(app);
        });
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

start();
