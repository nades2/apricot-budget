import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            // Proxy /api/* to the NestJS backend during dev so the frontend can call
            // /api/calendar without hardcoding http://localhost:3000 anywhere.
            '/api': 'http://localhost:3000',
        },
    },
});
