// Google AdSense configuration + script loader.
//
// HOW TO GO LIVE:
//   1. Create a Google AdSense account and get your publisher ID
//      (looks like "ca-pub-1234567890123456").
//   2. Replace ADSENSE_CLIENT below with that ID.
//   3. In AdSense, create ad units and paste their slot IDs into AD_SLOTS.
//
// Until ADSENSE_CLIENT is set to a real ca-pub-* value, the ad components
// render a lightweight placeholder instead of calling AdSense, so the site
// works fine in development and before approval.

export const ADSENSE_CLIENT = 'ca-pub-8963517968359103';

// Ad unit slot IDs (created in your AdSense dashboard, one per placement).
// Slots left as zeros are treated as not-configured: those placements keep
// rendering preview boxes (admins only) instead of requesting blank ads.
export const AD_SLOTS = {
  sidebar: '0000000000',
  bottom: '0000000000',
  rewarded: '0000000000', // daily-reward "watch an ad" placement
};

// True when a placement has a real slot ID plugged in.
export const slotReady = (slot) =>
  typeof slot === 'string' && /^\d+$/.test(slot) && !/^0+$/.test(slot);

// ── DEBUG / PREVIEW MODE ─────────────────────────────────────────────
// When true, the ad slots render labeled preview boxes (with working close
// buttons) even though no real AdSense ID is configured yet - so you can see
// exactly where ads will appear and test closing them.
//
// Default ON until Jack's real publisher ID is plugged in. You can also force
// it per-browser without editing code:
//   • visit the site with ?adsDebug=1  (or ?adsDebug=0 to turn off)
//   • that choice is remembered in localStorage
const ADS_DEBUG_DEFAULT = true;

export const adsDebug = () => {
  if (typeof window === 'undefined') return ADS_DEBUG_DEFAULT;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('adsDebug')) {
      const on = params.get('adsDebug') !== '0';
      localStorage.setItem('prompted-ads-debug', on ? '1' : '0');
      return on;
    }
    const stored = localStorage.getItem('prompted-ads-debug');
    if (stored !== null) return stored === '1';
  } catch {
    /* ignore storage/URL access issues */
  }
  return ADS_DEBUG_DEFAULT;
};

// True once a real publisher ID has been configured.
export const adsEnabled = () =>
  typeof ADSENSE_CLIENT === 'string' &&
  ADSENSE_CLIENT.startsWith('ca-pub-') &&
  !ADSENSE_CLIENT.includes('X');

let scriptLoaded = false;

// Injects the AdSense library exactly once. No-op until ads are enabled.
// index.html already loads the script in <head> (Google site verification),
// so this only acts as a fallback if that tag is ever removed.
export function loadAdSense() {
  if (scriptLoaded || !adsEnabled() || typeof document === 'undefined') return;
  if (document.querySelector('script[src*="adsbygoogle.js"]')) {
    scriptLoaded = true;
    return;
  }
  scriptLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
}
