// Vercel serves Angular's browser build as static files, while this function
// sends every /api/* request through the application's Express API routes.
import app from '../src/server';

export default app;
