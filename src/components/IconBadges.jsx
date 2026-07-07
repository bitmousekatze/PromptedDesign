import React, { useState, useEffect, useCallback } from 'react';
import { ICON_BADGES, getIconBadge } from '../lib/profileIcons.jsx';
import { fetchIconCollection, openIconPack, setProfileIconBadges } from '../lib/profileBadges.js';

// ============================================================
// Read-only display: the row of icon badges shown next to a name.
// `slugs` is profiles.profile_icon_badges. `color` tints them.
// ============================================================
export function ProfileIconBadges({ slugs, color, size = 18, gap = 4 }) {
  const list = (slugs || []).map(getIconBadge).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, color: color || 'var(--accent-primary, #4ECDC4)', verticalAlign: 'middle' }}>
      {list.map(({ slug, label, Icon }) => (
        <span key={slug} title={label} style={{ display: 'inline-flex' }}><Icon size={size} /></span>
      ))}
    </span>
  );
}

// ============================================================
// Collection + loot-box modal. Open packs (watch an ad → 6 random new icons,
// 2/day), then choose which unlocked icons fill your slots (free 3 / Pro 10).
// ============================================================
const PANEL_BG = '#0c0d10';
const BORDER = '#2a2f3a';

export function IconCollectionModal({ isOpen, onClose, onUpgrade }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState([]);
  const [adPlaying, setAdPlaying] = useState(false);
  const [adCountdown, setAdCountdown] = useState(0);
  const [reveal, setReveal] = useState(null); // array of slugs just pulled

  const load = useCallback(() => {
    setLoading(true);
    fetchIconCollection()
      .then((d) => { setData(d); setSelected(d?.selected || []); setLoading(false); })
      .catch((e) => { setMsg(e.message); setLoading(false); });
  }, []);
  useEffect(() => { if (isOpen) { setReveal(null); setMsg(''); load(); } }, [isOpen, load]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  if (!isOpen) return null;

  const owned = new Set(data?.owned || []);
  const slots = data?.slots || 3;
  const packsLeft = data ? Math.max(0, (data.packs_per_day || 2) - (data.packs_used_today || 0)) : 0;
  const collectedAll = data && (data.owned?.length || 0) >= (data.catalog_size || ICON_BADGES.length);

  // ---- watch-ad → open pack ----
  const watchAdAndOpen = () => {
    if (busy || adPlaying || packsLeft <= 0 || collectedAll) return;
    // Lightweight rewarded-ad placeholder: a 5s countdown stands in for the ad.
    // Swap this block for a real AdSense rewarded unit when available.
    setAdPlaying(true);
    setAdCountdown(5);
    const tick = setInterval(() => {
      setAdCountdown((c) => {
        if (c <= 1) {
          clearInterval(tick);
          setAdPlaying(false);
          doOpenPack();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const doOpenPack = async () => {
    setBusy(true);
    try {
      const res = await openIconPack();
      if (!res.ok) {
        flash(res.reason === 'daily_limit' ? "That's both packs for today — come back tomorrow!"
          : res.reason === 'collected_all' ? "You've collected every icon! 🎉" : 'Could not open pack.');
      } else {
        setReveal(res.pulled);
        load();
      }
    } catch (e) { flash(e.message); }
    finally { setBusy(false); }
  };

  // ---- slot selection ----
  const toggleSlot = (slug) => {
    if (!owned.has(slug)) return;
    setSelected((cur) => {
      if (cur.includes(slug)) return cur.filter((s) => s !== slug);
      if (cur.length >= slots) { flash(`You have ${slots} slot${slots === 1 ? '' : 's'}.${data?.is_pro ? '' : ' Upgrade to Pro for 10.'}`); return cur; }
      return [...cur, slug];
    });
  };

  const saveSlots = async () => {
    setBusy(true);
    try { await setProfileIconBadges(selected); flash('Saved to your profile ✓'); load(); }
    catch (e) { flash(e.message); }
    finally { setBusy(false); }
  };

  const dirty = data && JSON.stringify(selected) !== JSON.stringify(data.selected || []);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 96vw)', maxHeight: '90vh', overfl: 'hidden', display: 'flex', flexDirection: 'column', background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 16, color: '#f0f0f0', fontFamily: "'Space Grotesk', sans-serif" }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>✨ Icon Badges</span>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{data ? `${data.owned?.length || 0}/${data.catalog_size} collected` : ''}</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#ff6b6b', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto' }}>
          {loading && <div style={{ color: '#6b7280', fontSize: 13 }}>Loading…</div>}

          {/* Loot box */}
          {!loading && data && (
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 16, background: 'linear-gradient(135deg, rgba(78,205,196,0.06), rgba(217,119,87,0.06))' }}>
              {adPlaying ? (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>Ad playing… your pack opens in</div>
                  <div style={{ fontSize: 40, fontWeight: 800, color: '#4ECDC4' }}>{adCountdown}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>(placeholder — swap for a real rewarded ad)</div>
                </div>
              ) : reveal ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#C9A227', marginBottom: 10 }}>You pulled {reveal.length} new icon{reveal.length === 1 ? '' : 's'}!</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                    {reveal.map((slug) => {
                      const b = getIconBadge(slug);
                      return b ? (
                        <div key={slug} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, animation: 'iconPop 0.4s ease' }}>
                          <span style={{ color: '#4ECDC4', display: 'inline-flex', padding: 10, border: `1px solid ${BORDER}`, borderRadius: 10, background: '#15171c' }}><b.Icon size={26} /></span>
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>{b.label}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                  <button onClick={() => setReveal(null)} style={{ marginTop: 12, ...primaryBtn }}>Nice!</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 34 }}>🎁</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Open a loot pack</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8' }}>Watch an ad for <strong>6 random</strong> new icons · {packsLeft} pack{packsLeft === 1 ? '' : 's'} left today</div>
                  </div>
                  <button
                    onClick={watchAdAndOpen}
                    disabled={busy || packsLeft <= 0 || collectedAll}
                    style={{ ...primaryBtn, opacity: (busy || packsLeft <= 0 || collectedAll) ? 0.5 : 1 }}>
                    {collectedAll ? 'All collected 🎉' : packsLeft <= 0 ? 'Back tomorrow' : '▶ Watch ad'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Slots + collection */}
          {!loading && data && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>
                  Your badges · {selected.length}/{slots} slots
                </span>
                {!data.is_pro && (
                  <button onClick={onUpgrade} style={{ fontSize: 11, color: '#C9A227', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                    Pro = 10 slots
                  </button>
                )}
              </div>
              <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 10px' }}>Tap unlocked icons to add them to your profile (in order).</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: 8 }}>
                {ICON_BADGES.map(({ slug, label, Icon }) => {
                  const isOwned = owned.has(slug);
                  const idx = selected.indexOf(slug);
                  const isSel = idx >= 0;
                  return (
                    <button key={slug} onClick={() => toggleSlot(slug)} disabled={!isOwned} title={isOwned ? label : `${label} — locked`}
                      style={{
                        position: 'relative', aspectRatio: '1', borderRadius: 10, cursor: isOwned ? 'pointer' : 'not-allowed',
                        border: `1px solid ${isSel ? '#4ECDC4' : BORDER}`,
                        background: isSel ? 'rgba(78,205,196,0.14)' : isOwned ? '#15171c' : '#0e0f12',
                        color: isOwned ? '#e2e8f0' : '#3a4150',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      <Icon size={22} />
                      {!isOwned && <span style={{ position: 'absolute', top: 3, right: 4, fontSize: 9 }}>🔒</span>}
                      {isSel && <span style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 9, fontWeight: 800, color: '#4ECDC4' }}>{idx + 1}</span>}
                    </button>
                  );
                })}
              </div>

              {dirty && (
                <button onClick={saveSlots} disabled={busy} style={{ ...primaryBtn, width: '100%', marginTop: 14 }}>
                  Save to profile
                </button>
              )}
            </>
          )}

          {msg && <div style={{ marginTop: 12, fontSize: 12, color: '#9fe5df', background: 'rgba(78,205,196,0.08)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px' }}>{msg}</div>}
        </div>
      </div>
      <style>{`@keyframes iconPop { 0% { transform: scale(0.3); opacity: 0; } 70% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}

const primaryBtn = {
  padding: '8px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
  border: 'none', background: '#4ECDC4', color: '#06251f',
};
