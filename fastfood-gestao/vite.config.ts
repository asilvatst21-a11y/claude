import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-*.png', 'maskable-icon-512.png'],
      manifest: {
        name: 'FastFood Gestão',
        short_name: 'FF Gestão',
        description: 'Sistema de gestão para fast food',
        theme_color: '#ff6b35',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'pt-BR',
        icons: [
          { src: 'pwa-72.png',            sizes: '72x72',   type: 'image/png' },
          { src: 'pwa-96.png',            sizes: '96x96',   type: 'image/png' },
          { src: 'pwa-128.png',           sizes: '128x128', type: 'image/png' },
          { src: 'pwa-144.png',           sizes: '144x144', type: 'image/png' },
          { src: 'pwa-152.png',           sizes: '152x152', type: 'image/png' },
          { src: 'pwa-192.png',           sizes: '192x192', type: 'image/png' },
          { src: 'pwa-384.png',           sizes: '384x384', type: 'image/png' },
          { src: 'pwa-512.png',           sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
