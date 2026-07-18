import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Field PWA — Route Supervisor + Vet, one shared shell (CLAUDE.md: "ONE
// offline-capable field PWA ... role-gated views, never shared screens").
// Talks to the SAME backend as the farmer Flutter app and the (future)
// back-office dashboard — one source of truth across all three apps.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Allied KCC — Field',
        short_name: 'KCC Field',
        description: 'Route Supervisor + Vet field verification, offline-first',
        theme_color: '#0f7a4d',
        background_color: '#f4f6f5',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // App shell (JS/CSS/HTML) is precached for offline boot; API calls
        // are never cached here — offline WRITE support is handled by our
        // own IndexedDB queue (src/offline/db.ts), not a service-worker cache,
        // since verification submissions must be idempotent-replayed against
        // the real backend, not served stale from a cache.
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
});
