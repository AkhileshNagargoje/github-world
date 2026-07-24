import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// `base` is set to './' so the built app works both on Vercel (served at root)
// and on GitHub Pages (served from a repo subpath) without extra config.
export default defineConfig({
  base: './',
  plugins: [react()],
})
