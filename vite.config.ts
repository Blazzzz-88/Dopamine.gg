import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: {
    __ENABLE_PERSONAL_VALO_PACK__: JSON.stringify(
      mode !== 'cleanzip' && !process.env.VITEST && (command === 'serve' || command === 'build')
    ),
  },
  build: {
    assetsInlineLimit: 10_000_000,
  },
  server: {
    host: true,
    port: 5173,
  },
}));
