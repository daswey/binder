import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Binder',
        short_name: 'Binder',
        description: 'Hyper-local TCG trading and event discovery',
        theme_color: '#6366f1',
        background_color: '#030712',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        categories: ['games', 'social', 'shopping'],
        screenshots: [],
      },
      workbox: {
        importScripts: ['/sw-push.js'],
        // Cache strategies
        runtimeCaching: [
          {
            // API calls: network-first, fall back to cache for offline
            urlPattern: /^https?:\/\/.*\/api\/(cards|events|feed)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }, // 1 day
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Card images: cache-first (they rarely change)
            urlPattern: /\.(png|jpg|jpeg|webp|svg)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
            },
          },
          {
            // Google Fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
        // Precache the app shell
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Don't cache socket.io or auth endpoints
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/socket.io/],
      },
      devOptions: {
        enabled: true, // Enable SW in dev for testing
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@binder/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
