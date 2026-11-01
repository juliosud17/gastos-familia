import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' faz o app funcionar em qualquer endereço (GitHub Pages, domínio próprio)
export default defineConfig({
  base: './',
  plugins: [react()],
})
