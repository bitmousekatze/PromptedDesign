/**
 * Router configuration - Phase 1.4: BrowserRouter with code-split lazy pages.
 *
 * 14 page components in App.jsx are now React.lazy() imports, each in its own
 * Vite chunk. The Suspense boundary here catches any page suspension at
 * runtime. Tradeoff: wraps entire App (causes brief full-page flash during
 * tab nav). Phase 2 refines this with per-page Suspense or startTransition.
 */
import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import App from './App';
import PageLoader from './components/PageLoader';

function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/*
          Phase 1.4: <App /> is wrapped in a Suspense boundary so React.lazy()
          page components inside App.jsx (ArenaPage, GamesPage, etc.) can suspend
          without crashing. The fallback is null - chunks are small enough (most
          <50 KB) that the flash is imperceptible on any reasonable connection.

          In Phase 2, individual routes replace the catch-all:
          <Route path="/arena" element={<LazyRoute><LazyArenaPage /></LazyRoute>} />
        */}
        <Route path="/*" element={
          <React.Suspense fallback={
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '100vh',
              background: 'var(--bg-primary, #0a0a0a)',
            }}>
              <PageLoader size={24} text="Loading" />
            </div>
          }>
            <App />
          </React.Suspense>
        } />
      </Routes>
    </BrowserRouter>
  );
}
