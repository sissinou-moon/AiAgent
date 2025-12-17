import express, { Application } from 'express';
import taskRoutes from './routes/task.routes';
import listEndpoints from 'express-list-endpoints';

const app: Application = express();

app.use(express.json());

// Routes
app.use('/', taskRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Function to print routes with emojis
export const printRoutes = (app: Application) => {
    const routes = listEndpoints(app);
    console.log('\n🚀  Available Routes:');
    routes.forEach((route: any) => {
        route.methods.forEach((method: any) => {
            let emoji = '📌';
            if (method === 'GET') emoji = '🔍';
            if (method === 'POST') emoji = '📝';
            if (method === 'PUT') emoji = '✏️';
            if (method === 'DELETE') emoji = '🗑️';
            console.log(`   ${emoji}  ${method.padEnd(6)} ${route.path}`);
        });
    });
    console.log('\n');
};

export default app;
