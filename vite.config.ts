/**
 * Dev server setup: React, Tailwind styles, and the local API (server/plugin.ts), which runs inside the
 * dev server so the API key stays on this computer.
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { apiPlugin } from './server/plugin.ts';

export default defineConfig({
  // apiPlugin adds the local-only /api routes (figure extraction) to `npm run dev`.
  plugins: [react(), tailwindcss(), apiPlugin()],
});
