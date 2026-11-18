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
  // The shared demo (`npm run demo`) is reached through a Cloudflare quick tunnel, whose address changes each time
  // (docs/hosting.md). Vite refuses unknown host names, so allow those addresses, for the demo server only.
  preview: { allowedHosts: ['.trycloudflare.com'] },
});
