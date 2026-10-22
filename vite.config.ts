/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
  test: {
    // Vitest stubs CSS to empty strings; the stylesheet is let through so the
    // design-token test can read it (src/ui/tokens.test.ts).
    css: { include: [/src\/index\.css/] },
  },
})
