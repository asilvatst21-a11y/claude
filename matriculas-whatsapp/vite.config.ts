import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Identificador do build, exibido no rodapé do login para confirmar
// rapidamente, em produção, qual versão está realmente carregada (útil
// para descartar cache antigo do navegador/PWA).
const BUILD_ID = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    tailwindcss(),
    // PWA temporariamente em modo "self-destroying": ao invés de instalar
    // um service worker que faz cache, esta versão remove qualquer service
    // worker já registrado e limpa todos os caches do dispositivo. Isso
    // resolve de forma definitiva o problema de aparelhos presos numa versão
    // antiga do app. Quando o fluxo estiver estável, basta voltar para a
    // configuração com manifest/workbox para reativar o suporte offline.
    VitePWA({
      selfDestroying: true,
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
