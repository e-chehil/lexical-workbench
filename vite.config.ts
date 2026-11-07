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
          name: 'Lexical Workbench — 英语词汇数据库与词族分析工作台',
          short_name: 'LexicalWB',
          description:
            '本地优先的个人英语词汇数据库、BNC/COCA 词族检索、CET-4/CET-6 大纲对照与学习规划系统',
          theme_color: '#1D4ED8',
          background_color: '#F8FAFC',
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
