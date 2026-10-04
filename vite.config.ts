import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE is set by the Pages deploy workflow (e.g. "/Nusantara/"); local builds use "/".
// __TEST_HOOKS__ is true only for `--mode e2e`, so hook code is dropped from production builds.
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  define: {
    __TEST_HOOKS__: JSON.stringify(mode === 'e2e'),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
}));
