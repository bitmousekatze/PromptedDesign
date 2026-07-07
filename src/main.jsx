console.log('[Prompted] main.jsx loaded');

import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { queryClient } from './lib/queryClient'
import { initNativeShell } from './lib/nativeBootstrap'
// Side-effect import: starts polling the site-wide read-only flag and arms
// the write gate in lib/supabase.js (see lib/readOnly.js).
import './lib/readOnly'
import App from './App'

// Native (Capacitor) shell setup: status bar, hardware back button, OAuth
// deep-link return. No-op in a normal web browser.
initNativeShell();

// Suppress AbortError noise from unmounted/cancelled requests
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason?.name === 'AbortError' ||
    event.reason?.message?.includes('signal is aborted') ||
    event.reason?.message?.includes('abort')
  ) {
    event.preventDefault();
  }
});

const rootEl = document.getElementById('root');

if (!rootEl) {
  console.error('[Prompted] #root element not found!');
} else {
  try {
    console.log('[Prompted] Mounting React app...');
    const root = ReactDOM.createRoot(rootEl);
    root.render(
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </HelmetProvider>
    );
    // Mark app as loaded AFTER render call succeeds — this tells the
    // global error handler in index.html that React owns the DOM now.
    rootEl.dataset.appLoaded = 'true';
    console.log('[Prompted] React app mounted successfully');
  } catch (err) {
    console.error('[Prompted] Failed to mount React app:', err);
    rootEl.innerHTML = '<div style="padding:2rem;color:white;background:#0a0a0a;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui"><div><h1 style="color:#ff6b6b">Failed to load app</h1><p style="color:#a0a0a0;margin-top:1rem">Check console for details. Try refreshing the page.</p><pre style="color:#ff6b6b;margin-top:1rem;font-size:0.875rem">' + (err?.message || err) + '</pre><button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1rem;background:#fff;color:#000;border:none;border-radius:6px;cursor:pointer">Retry</button></div></div>';
  }
}
