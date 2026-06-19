import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
    // Não registramos mais nenhum service worker. O modo "self-destroying"
    // do vite-plugin-pwa já cumpriu seu papel (limpou os caches antigos e
    // destravou os aparelhos presos numa versão velha), mas ele voltava a se
    // registrar a cada carregamento e, ao ativar, forçava o reload de todas as
    // janelas abertas (client.navigate) — criando um laço infinito de
    // recarregamento que aparecia como "travada" na tela de login, sobretudo
    // no PWA instalado (sem barra de endereço para evidenciar o reload).
    // O ícone/instalação continuam funcionando via public/manifest.webmanifest.
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
