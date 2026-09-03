import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project sites are served from /<repo>/, so the demo build
// passes VITE_BASE_PATH=/Chunki/ (see package.json's build:pages script and
// .github/workflows/deploy-pages.yml). Everything else (local dev, a real
// deployment with its own domain) keeps the default root path.
const base = process.env.VITE_BASE_PATH || '/';

// Surfaced in the profile dialog and used to tell users a new build shipped.
// GITHUB_SHA is set automatically in every Actions run; local builds fall
// back to the checked-out commit.
function commitSha() {
  const fromEnv = process.env.GITHUB_SHA || process.env.VITE_COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

const appVersion = `${process.env.npm_package_version || '0.0.0'}+${commitSha()}`;

export default defineConfig({
  base,
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // We register the SW ourselves via virtual:pwa-register/react (see
      // UpdatePrompt.tsx) so we can show an in-app "update available" banner
      // instead of the plugin's default silent/auto-injected registration.
      injectRegister: null,
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
