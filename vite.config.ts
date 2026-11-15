import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { apiPlugin } from './server/plugin.ts';

export default defineConfig({
  // apiPlugin adds the local-only /api routes (figure extraction) to `npm run dev`.
  plugins: [react(), tailwindcss(), apiPlugin()],
});
