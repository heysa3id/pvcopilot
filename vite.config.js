import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/', // use '/' for custom domain (e.g. www.pvcopilot.com)
  plugins: [react()],
})
