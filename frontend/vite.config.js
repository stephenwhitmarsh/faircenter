import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is set for GitHub Pages project hosting:
//   https://stephenwhitmarsh.github.io/faircenter/
// For local dev this is harmless. If the repo is renamed, change it here.
export default defineConfig({
  plugins: [react()],
  base: '/faircenter/',
})
