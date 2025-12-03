import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
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
