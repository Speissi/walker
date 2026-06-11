import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' makes the build relocatable, so it works when served from a
// GitHub Pages project path like https://<user>.github.io/walker/
export default defineConfig({
  base: './',
  plugins: [react()],
})
