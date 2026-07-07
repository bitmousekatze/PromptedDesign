import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run dev` is plain Vite — the api/ folder only runs on Vercel. Proxy
    // /api to production so serverless-backed features (Stripe checkout, OG
    // tags, sitemap) work in local dev. NOTE: these hit the LIVE deployment —
    // checkout sessions and grants are real, and new/changed api/ code doesn't
    // take effect locally until it's deployed.
    proxy: {
      '/api': {
        target: 'https://prmpted.com',
        changeOrigin: true,
      },
    },
    watch: {
      // Capacitor/Gradle builds delete + recreate android/ build output while
      // dev is running; on Windows that churn throws an FSWatcher "UNKNOWN
      // scandir" and crashes the dev server. Don't watch the native build tree.
      ignored: ['**/android/**'],
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
