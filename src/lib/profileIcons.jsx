import React from 'react';

// ============================================================
// Profile icon-badge registry.
//
// Each entry: { slug, label, Icon }. `Icon` is a stroke-based SVG that inherits
// `currentColor`, so the display layer can tint it per-user.
//
// These seed icons are ORIGINAL simple line shapes (license-clean). To add more
// - e.g. icons from itshover.com once you've confirmed their license - just drop
// another entry in ICON_BADGES with a unique slug and an SVG component. The slug
// is what gets stored in profiles.profile_icon_badges, so never rename a slug
// that's already in use.
// ============================================================

const svg = (children) => ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const ICON_BADGES = [
  { slug: 'star',    label: 'Star',    Icon: svg(<path d="M12 3l2.6 5.6 6 .7-4.4 4.1 1.2 5.9L12 17.8 6.6 19.3l1.2-5.9L3.4 9.3l6-.7z" />) },
  { slug: 'heart',   label: 'Heart',   Icon: svg(<path d="M12 20s-7-4.6-9-9.1C1.8 8 3.3 5 6.2 5 8 5 9.3 6 12 8.4 14.7 6 16 5 17.8 5c2.9 0 4.4 3 3.2 5.9C19 15.4 12 20 12 20z" />) },
  { slug: 'bolt',    label: 'Bolt',    Icon: svg(<path d="M13 2L4 14h6l-1 8 9-12h-6z" />) },
  { slug: 'flame',   label: 'Flame',   Icon: svg(<path d="M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.2.4-2 1-2.8C8 9 8 6 12 2z" />) },
  { slug: 'crown',   label: 'Crown',   Icon: svg(<><path d="M3 7l4 5 5-7 5 7 4-5v11H3z" /><path d="M3 21h18" /></>) },
  { slug: 'rocket',  label: 'Rocket',  Icon: svg(<><path d="M5 15c-1 1-2 5-2 5s4-1 5-2" /><path d="M9 12a12 12 0 0 1 8-8c2 0 3 1 3 3a12 12 0 0 1-8 8z" /><circle cx="15" cy="9" r="1.5" /></>) },
  { slug: 'diamond', label: 'Diamond', Icon: svg(<path d="M6 3h12l3 5-9 13L3 8z" />) },
  { slug: 'moon',    label: 'Moon',    Icon: svg(<path d="M20 14a8 8 0 1 1-10-10 6 6 0 0 0 10 10z" />) },
  { slug: 'sun',     label: 'Sun',     Icon: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>) },
  { slug: 'sparkle', label: 'Sparkle', Icon: svg(<path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z" />) },
  { slug: 'trophy',  label: 'Trophy',  Icon: svg(<><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" /><path d="M12 13v4M8 21h8M10 17h4" /></>) },
  { slug: 'medal',   label: 'Medal',   Icon: svg(<><circle cx="12" cy="15" r="5" /><path d="M9 2l3 6 3-6" /><path d="M12 13l1 2 2 .2-1.4 1.4.4 2L12 18l-2 .6.4-2L9 15.2 11 15z" /></>) },
  { slug: 'fire2',   label: 'Ember',   Icon: svg(<path d="M12 2C9 6 7 8 7 12a5 5 0 0 0 10 0c0-2-1-3-2-4 0 1.5-1 2-1.5 2 .5-2-.5-5-1.5-8z" />) },
  { slug: 'leaf',    label: 'Leaf',    Icon: svg(<><path d="M5 19c0-8 6-13 14-13 0 8-5 14-13 14a6 6 0 0 1-1-1z" /><path d="M5 19c3-3 6-5 9-6" /></>) },
  { slug: 'music',   label: 'Music',   Icon: svg(<><circle cx="6" cy="18" r="2.5" /><circle cx="17" cy="16" r="2.5" /><path d="M8.5 18V6l11-2v10" /></>) },
  { slug: 'globe',   label: 'Globe',   Icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>) },
  { slug: 'shield',  label: 'Shield',  Icon: svg(<><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>) },
  { slug: 'eye',     label: 'Eye',     Icon: svg(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>) },
  { slug: 'bell',    label: 'Bell',    Icon: svg(<><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></>) },
  { slug: 'paw',     label: 'Paw',     Icon: svg(<><circle cx="6" cy="11" r="1.6" /><circle cx="10" cy="7" r="1.6" /><circle cx="14" cy="7" r="1.6" /><circle cx="18" cy="11" r="1.6" /><path d="M8 16c0-2.5 1.8-4 4-4s4 1.5 4 4-2 4-4 4-4-1.5-4-4z" /></>) },
  { slug: 'cat',     label: 'Cat',     Icon: svg(<><path d="M4 6l3 3M20 6l-3 3" /><path d="M5 9c0-1 1-3 2-3s2 2 2 3M15 9c0-1 1-3 2-3s2 2 2 3" /><path d="M5 12a7 7 0 0 0 14 0v-2H5z" /><path d="M9 14h.01M15 14h.01M12 15v2" /></>) },
  { slug: 'ghost',   label: 'Ghost',   Icon: svg(<><path d="M5 20V11a7 7 0 0 1 14 0v9l-2.3-2-2.3 2-2.4-2-2.3 2-2.4-2z" /><path d="M9 10h.01M15 10h.01" /></>) },
  { slug: 'skull',   label: 'Skull',   Icon: svg(<><path d="M5 11a7 7 0 0 1 14 0c0 3-2 4-2 5v2H7v-2c0-1-2-2-2-5z" /><circle cx="9" cy="11" r="1.4" /><circle cx="15" cy="11" r="1.4" /><path d="M11 21v-2h2v2" /></>) },
  { slug: 'cloud',   label: 'Cloud',   Icon: svg(<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4 4 0 0 1 17 18z" />) },
  { slug: 'anchor',  label: 'Anchor',  Icon: svg(<><circle cx="12" cy="5" r="2" /><path d="M12 7v13" /><path d="M5 13a7 7 0 0 0 14 0" /><path d="M5 13H3M21 13h-2" /></>) },
  { slug: 'key',     label: 'Key',     Icon: svg(<><circle cx="8" cy="8" r="4" /><path d="M11 11l8 8M16 16l2-2M19 19l2-2" /></>) },
  { slug: 'gem',     label: 'Gem',     Icon: svg(<><path d="M5 9l3-4h8l3 4-7 11z" /><path d="M5 9h14M9 5l3 4 3-4M12 9v11" /></>) },
  { slug: 'compass', label: 'Compass', Icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M15 9l-2 4-4 2 2-4z" /></>) },
  { slug: 'wave',    label: 'Wave',    Icon: svg(<path d="M2 9c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2M2 15c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2" />) },
  { slug: 'pin',     label: 'Pin',     Icon: svg(<><path d="M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>) },
];

const BY_SLUG = Object.fromEntries(ICON_BADGES.map((b) => [b.slug, b]));
export const getIconBadge = (slug) => BY_SLUG[slug] || null;
