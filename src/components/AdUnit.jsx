import React, { useEffect, useRef, useState } from 'react';
import { ADSENSE_CLIENT, AD_SLOTS, adsEnabled, adsDebug, slotReady, loadAdSense } from '../lib/ads';
import { isNativeApp } from '../lib/platform';

// Whether to render anything at all.
//   • Admins ALWAYS see the debug/preview boxes for testing — even if they're
//     Pro (so the team can verify ad placements before going live).
//   • Prompted Pro members never see real ads (paid ad-free perk).
//   • Real ads show to everyone else once an AdSense ID is configured AND the
//     placement has a real slot ID (zeros = not created yet in AdSense).
//   • Regular users never see placeholder/preview ads before ads go live.
const adsVisible = ({ isAdmin = false, isPro = false, slot } = {}) => {
  // Google AdSense is not permitted inside apps/WebViews (AdMob is the in-app
  // product). Never render web ads in the native Capacitor shell.
  if (isNativeApp()) return false;
  if (adsDebug() && !!isAdmin) return true; // admin testing overrides Pro
  if (isPro) return false;
  return adsEnabled() && slotReady(slot);
};

const DISMISS_KEY = 'prompted-ads-dismissed';

// Bottom banner stays dismissed for the rest of the session once closed.
const isDismissed = (id) => {
  try {
    return sessionStorage.getItem(`${DISMISS_KEY}:${id}`) === '1';
  } catch {
    return false;
  }
};
const setDismissed = (id) => {
  try {
    sessionStorage.setItem(`${DISMISS_KEY}:${id}`, '1');
  } catch {
    /* ignore storage failures (private mode, etc.) */
  }
};

// Renders a single AdSense unit, or a labeled placeholder before ads are
// configured so layout/spacing is visible during development.
function AdSlot({ slot, format = 'auto', responsive = true, style, label }) {
  const insRef = useRef(null);

  useEffect(() => {
    if (!adsEnabled() || !slotReady(slot)) return;
    loadAdSense();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* AdSense not ready yet — it will retry on next render */
    }
  }, [slot]);

  if (!adsEnabled() || !slotReady(slot)) {
    // Debug/preview box: shows where the ad will be + a reminder it's a preview.
    return (
      <div className="ad-placeholder" style={style}>
        <span>{label || 'Advertisement'}</span>
        <small>Ad preview · add AdSense ID to go live · click × to close</small>
      </div>
    );
  }

  return (
    <ins
      ref={insRef}
      className="adsbygoogle"
      style={{ display: 'block', ...style }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive ? 'true' : 'false'}
    />
  );
}

// Closeable ad card for the right sidebar.
export function SidebarAd({ isAdmin = false, isPro = false }) {
  const [closed, setClosed] = useState(() => isDismissed('sidebar'));
  if (!adsVisible({ isAdmin, isPro, slot: AD_SLOTS.sidebar }) || closed) return null;

  return (
    <div className="sidebar-section ad-section">
      <div className="ad-card">
        <button
          className="ad-close"
          aria-label="Close ad"
          onClick={() => {
            setDismissed('sidebar');
            setClosed(true);
          }}
        >
          ×
        </button>
        <span className="ad-label">Ad</span>
        <AdSlot slot={AD_SLOTS.sidebar} label="Sidebar ad" style={{ minHeight: 250 }} />
      </div>
    </div>
  );
}

// Dismissible sticky banner pinned to the bottom of the viewport.
export function BottomAdBanner({ isAdmin = false, isPro = false }) {
  const [closed, setClosed] = useState(() => isDismissed('bottom'));
  if (!adsVisible({ isAdmin, isPro, slot: AD_SLOTS.bottom }) || closed) return null;

  return (
    <div className="ad-bottom-banner" role="complementary" aria-label="Advertisement">
      <button
        className="ad-close ad-close-banner"
        aria-label="Close ad"
        onClick={() => {
          setDismissed('bottom');
          setClosed(true);
        }}
      >
        ×
      </button>
      <span className="ad-label">Ad</span>
      <AdSlot
        slot={AD_SLOTS.bottom}
        format="horizontal"
        label="Bottom banner ad"
        style={{ height: 90, width: '100%', maxWidth: 728 }}
      />
    </div>
  );
}
