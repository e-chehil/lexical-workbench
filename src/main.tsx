import {createRoot} from 'react-dom/client';
import Root from './app/Root.tsx';
import './index.css';

// Safely register PWA service worker in production using Vite's BASE_URL (supports '/' and '/lexical-workbench/')
if (import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try {
      const base = import.meta.env.BASE_URL || '/';
      const normalizedBase = base.endsWith('/') ? base : `${base}/`;
      const swUrl = `${normalizedBase}sw.js`;
      navigator.serviceWorker.register(swUrl, { scope: normalizedBase }).catch(() => {
        // Ignore SecurityError in sandboxed/third-party iframes
      });
    } catch {
      // Ignore SecurityError in sandboxed/third-party iframes
    }
  });
}

createRoot(document.getElementById('root')!).render(<Root />);
