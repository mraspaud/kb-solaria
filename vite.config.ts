import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  
  // Tauri-specific settings
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'esnext',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
  
  // @ts-ignore - Vitest types might not be auto-detected without tsconfig tweaks, ignore for now
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest-setup.ts',
  },
  resolve: {
    conditions: ['browser'],
  }
})
