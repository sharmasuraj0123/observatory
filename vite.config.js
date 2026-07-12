import { defineConfig } from 'vite';

// The dev port comes from the PORT env var when launched by tooling; falls
// back to 5174 for manual `npm run dev`.
export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5174,
    strictPort: false,
  },
});
