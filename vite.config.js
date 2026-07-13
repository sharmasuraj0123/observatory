import { defineConfig } from 'vite';

// The dev port comes from the PORT env var when launched by tooling; falls
// back to 5174 for manual `npm run dev`.
export default defineConfig({
  appType: 'spa',
  server: {
    port: Number(process.env.PORT) || 5174,
    strictPort: false,
  },
  preview: {
    port: Number(process.env.PORT) || 5174,
  },
});
