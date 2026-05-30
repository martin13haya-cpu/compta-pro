import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Compta Pro — Gestion & Stock',
        short_name: 'Compta Pro',
        description: 'Gestion commerciale et stock pour entreprises béninoises',
        theme_color: '#0f2044',
        background_color: '#f1f5f9',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        lang: 'fr',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        shortcuts: [
          { name: 'Documents', short_name: 'Docs', url: '/?page=commercial', icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }] },
          { name: 'Stock', short_name: 'Stock', url: '/?page=stock', icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }] },
        ],
        categories: ['business', 'finance', 'productivity'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/proehigsikgqdrxjltmq\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
})
