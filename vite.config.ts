import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  const isGitHubPages = process.env.GITHUB_PAGES === 'true';
  const rawBase =
    process.env.VITE_BASE_PATH || (isGitHubPages ? '/lexical-workbench/' : '/');
  const basePath = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        workbox: {
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,svg,png,txt,json}'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
        manifest: {
          id: basePath,
          name: 'Lexical Workbench — 英语词汇观测台',
          short_name: 'LexicalWB',
          description:
            '本地优先的英语词汇观测台：COCA 2020、BNC/COCA 25k 与 CET 2016 的统一检索、词族分析与可解释学习规划',
          theme_color: '#101613',
          background_color: '#EEEAE1',
          display: 'standalone',
          orientation: 'any',
          scope: basePath,
          start_url: basePath,
          icons: [
            {
              src: `${basePath}pwa-192x192.png`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${basePath}pwa-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${basePath}pwa-maskable-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
