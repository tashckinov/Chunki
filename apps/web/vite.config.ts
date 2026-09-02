import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project sites are served from /<repo>/, so the demo build
// passes VITE_BASE_PATH=/Chunki/ (see package.json's build:pages script and
// .github/workflows/deploy-pages.yml). Everything else (local dev, a real
// deployment with its own domain) keeps the default root path.
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Chunki — английский чанками',
        short_name: 'Chunki',
        description: 'Персональный план изучения английского: чанки, тест уровня, темы, упражнения.',
        theme_color: '#6650B8',
        background_color: '#F8F8FA',
        display: 'standalone',
        scope: base,
        start_url: base,
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
