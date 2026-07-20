import { defineConfig } from 'vitest/config'
import path from 'path'

// Kept separate from vite.config.ts so the production build never has to resolve
// vitest. Tests cover pure logic only (manifest rendering, spec hashing, drift
// classification, cluster label inference, config validation) — no component or
// E2E tests, and nothing that needs a DOM or a live cluster.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    environment: 'node',
    include: ['{src,electron}/**/*.{test,spec}.ts'],
    reporters: 'default'
  }
})
