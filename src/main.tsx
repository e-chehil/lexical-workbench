import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely register PWA service worker in production when allowed by browser security policy
if (import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Ignore SecurityError in sandboxed/third-party iframes
      });
    } catch {
      // Ignore SecurityError in sandboxed/third-party iframes
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
