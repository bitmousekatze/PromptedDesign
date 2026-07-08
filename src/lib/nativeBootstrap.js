// Native-only wiring for the Capacitor Android/iOS shell. This is a no-op in a
// normal web browser, so it is always safe to call from main.jsx.
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { initPush } from './push';

export async function initNativeShell() {
  if (!Capacitor.isNativePlatform()) return;

  // Marks the app as running natively so CSS can gate native-only behavior
  // (e.g. TikTok-style feed scroll-snapping in App.jsx).
  document.documentElement.classList.add('native-app');

  const [{ App }, { StatusBar, Style }, { Browser }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/status-bar'),
    import('@capacitor/browser'),
  ]);

  // Dark status bar: white icons over the #0a0a0a app background. overlay:false
  // makes Android reserve space for the status bar so the web content (the tabs
  // header) is laid out BELOW it instead of being drawn underneath and clipped.
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0a0a0a' });
  } catch {
    /* StatusBar not available on this platform - ignore */
  }

  // NOTE: the hardware/gesture Back button is handled inside App.jsx (it needs
  // React state - open drawer, active tab, modals - to decide what Back does).
  // Deliberately NOT registered here so there's a single listener and Back no
  // longer exits the app on a swipe-right.

  // OAuth return: the system browser redirects to com.prmpted.app://auth-callback?code=...
  // Exchange the PKCE code for a session; the app's onAuthStateChange listener
  // then picks up the signed-in user.
  App.addListener('appUrlOpen', async ({ url }) => {
    if (!url || (!url.includes('auth-callback') && !url.includes('code='))) return;
    // Close the system browser FIRST. On Android the Custom Tab often won't
    // close once the deep link has already returned focus to the app, which
    // left users staring at the (now-useless) login page even though the
    // session was established. Closing up-front - before the async token
    // exchange - and retrying a moment later makes the dismissal reliable.
    const closeBrowser = async () => { try { await Browser.close(); } catch { /* already closed */ } };
    await closeBrowser();
    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');
      if (code) await supabase.auth.exchangeCodeForSession(code);
    } catch {
      /* malformed callback URL - ignore */
    }
    // Retry once after the exchange in case the tab re-surfaced on return.
    await closeBrowser();
    setTimeout(closeBrowser, 400);
  });

  // Push notifications: register the device with FCM (Android) / APNs (iOS) and
  // store the token per signed-in user. No-op until a user is signed in.
  initPush();
}
