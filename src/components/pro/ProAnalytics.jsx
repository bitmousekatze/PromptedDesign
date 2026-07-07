import { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from '../../lib/supabase.js';
import { fetchMyChannel, connectChannel } from '../../lib/zoe.js';

// Pro analytics: how your posts actually performed.
//   impressions    — your post appeared on someone's screen
//   views          — they opened it
//   profile visits — they clicked through to your profile from it
export default function ProAnalytics({ currentUser }) {
  const [rows, setRows] = useState([]);
  const [daily, setDaily] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [sortBy, setSortBy] = useState('views');

  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    (async () => {
      const [perPost, series] = await Promise.all([
        supabase.rpc('get_my_post_analytics'),
        supabase.rpc('get_my_analytics_daily', { p_days: 30 }),
      ]);
      if (perPost.error) setErr(perPost.error.message);
      setRows(perPost.data || []);
      setDaily((series.data || []).map((d) => ({
        ...d,
        label: new Date(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      })));
      setLoading(false);
    })();
  }, [currentUser]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    impressions: acc.impressions + Number(r.impressions || 0),
    views: acc.views + Number(r.views || 0),
    profileVisits: acc.profileVisits + Number(r.profile_visits || 0),
    likes: acc.likes + Number(r.likes || 0),
  }), { impressions: 0, views: 0, profileVisits: 0, likes: 0 }), [rows]);

  const sorted = useMemo(() => {
    const key = { views: 'views', impressions: 'impressions', visits: 'profile_visits', recent: 'created_at' }[sortBy];
    return [...rows].sort((a, b) =>
      sortBy === 'recent'
        ? new Date(b.created_at) - new Date(a.created_at)
        : Number(b[key] || 0) - Number(a[key] || 0)
    );
  }, [rows, sortBy]);

  if (!currentUser) return <p style={muted}>Sign in to see your analytics.</p>;
  if (loading) return <p style={muted}>Crunching your numbers…</p>;
  if (err) return <p style={{ ...muted, color: '#fca5a5' }}>Analytics unavailable: {err} (has the migration been applied?)</p>;

  const ctr = totals.impressions ? ((totals.views / totals.impressions) * 100).toFixed(1) : null;

  return (
    <div>
      {/* Lifetime totals */}
      <div style={statGrid}>
        <Stat label="Impressions" value={totals.impressions} hint="times your posts were seen" />
        <Stat label="Views" value={totals.views} hint="times your posts were opened" />
        <Stat label="Profile visits" value={totals.profileVisits} hint="people who came to your profile from a post" />
        <Stat label="Open rate" value={ctr !== null ? `${ctr}%` : '—'} hint="views ÷ impressions" />
      </div>

      {/* 30-day trend */}
      <div style={{ ...panel, marginTop: 18 }}>
        <div style={sectionLabel}>Last 30 days</div>
        {daily.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="impGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9ecbff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#9ecbff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="viewGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.15)', fontSize: 12 }}
                labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
              />
              <Area type="monotone" dataKey="impressions" name="Impressions" stroke="#9ecbff" fill="url(#impGrad)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="views" name="Views" stroke="#fff" fill="url(#viewGrad)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="profile_visits" name="Profile visits" stroke="#6ee7a0" fill="none" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ ...muted, margin: 0 }}>
            No activity recorded yet. Impressions and profile-visit tracking start counting from today — post something and watch this fill in.
          </p>
        )}
      </div>

      {/* Your live channel (Zoetrope / Zoe) */}
      <ChannelCard currentUser={currentUser} />

      {/* Per-post breakdown */}
      <div style={{ ...panel, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ ...sectionLabel, margin: 0 }}>Per post · lifetime</div>
          <select className="form-input" value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}>
            <option value="views">Most viewed</option>
            <option value="impressions">Most seen</option>
            <option value="visits">Most profile visits</option>
            <option value="recent">Newest</option>
          </select>
        </div>
        {!sorted.length ? (
          <p style={{ ...muted, marginTop: 14 }}>No posts yet — your first post starts the scoreboard.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Post</th>
                  <th style={th}>Seen</th>
                  <th style={th}>Opened</th>
                  <th style={th}>Open rate</th>
                  <th style={th}>→ Profile</th>
                  <th style={th}>Likes</th>
                  <th style={th}>Comments</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const imp = Number(r.impressions || 0);
                  const v = Number(r.views || 0);
                  return (
                    <tr key={r.post_id}>
                      <td style={{ ...td, textAlign: 'left', maxWidth: 280 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{r.title || 'Untitled'}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{new Date(r.created_at).toLocaleDateString()}</div>
                      </td>
                      <td style={td}>{imp}</td>
                      <td style={td}>{v}</td>
                      <td style={td}>{imp ? `${((v / imp) * 100).toFixed(0)}%` : '—'}</td>
                      <td style={td}>{Number(r.profile_visits || 0)}</td>
                      <td style={td}>{Number(r.likes || 0)}</td>
                      <td style={td}>{Number(r.comments || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', marginTop: 12, marginBottom: 0 }}>
          "Seen" and "→ Profile" started tracking when Pro analytics launched; older activity isn't counted retroactively.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>{label}</div>
      <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 34, lineHeight: 1.1, margin: '10px 0 6px' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)' }}>{hint}</div>
    </div>
  );
}

// "Your live channel" — connect Twitch/YouTube so you can Go Live on the Zoe tab.
// Lives here (not Settings) because connecting is a growth action with a payoff
// the Analytics tab measures (clicks from Prompted).
function ChannelCard({ currentUser }) {
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('twitch');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind: 'ok' | 'err', text }

  useEffect(() => {
    if (!currentUser?.id) { setLoading(false); return; }
    fetchMyChannel(currentUser.id)
      .then((c) => setChannel(c))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentUser?.id]);

  // Prefill the input with whatever's already saved for the selected platform.
  useEffect(() => {
    const existing = platform === 'twitch' ? channel?.twitch_url : channel?.youtube_url;
    setUrl(existing || '');
  }, [platform, channel]);

  const save = async () => {
    if (!url.trim()) { setMsg({ kind: 'err', text: 'Paste your channel link first.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const row = await connectChannel(platform, url.trim());
      setChannel(row);
      setMsg({ kind: 'ok', text: `${platform === 'twitch' ? 'Twitch' : 'YouTube'} channel saved. Head to the Zeo tab to Go Live.` });
    } catch (e) {
      setMsg({ kind: 'err', text: e.message || 'Could not save your channel.' });
    } finally { setBusy(false); }
  };

  if (loading) return null;

  const connected = !!(channel?.twitch_url || channel?.youtube_url);

  return (
    <div style={{ ...panel, marginTop: 18 }}>
      <div style={sectionLabel}>Your live channel</div>
      <p style={{ ...muted, margin: '0 0 14px' }}>
        Connect Twitch or YouTube, then <b style={{ color: '#fff' }}>Go Live</b> from the Zeo tab — your stream embeds on Prompted and the whole community gets pinged.
      </p>

      {connected && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.09)', marginBottom: 16 }}>
          <Stat label="Twitch" value={channel.twitch_url ? '✓ linked' : '—'} hint={channel.twitch_url || 'not connected'} />
          <Stat label="YouTube" value={channel.youtube_url ? '✓ linked' : '—'} hint={channel.youtube_url || 'not connected'} />
          <Stat label="Clicks from Prompted" value={Number(channel.click_count || 0)} hint="taps through to your channel" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {['twitch', 'youtube'].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              border: platform === p ? '1px solid #FF4D4D' : '1px solid rgba(255,255,255,0.15)',
              background: platform === p ? 'rgba(255,77,77,0.14)' : 'transparent',
              color: platform === p ? '#fff' : 'rgba(255,255,255,0.6)',
            }}
          >
            {p === 'twitch' ? 'Twitch' : 'YouTube'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder={platform === 'twitch' ? 'twitch.tv/yourname' : 'youtube.com/@yourchannel'}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          onClick={save}
          disabled={busy}
          style={{ padding: '0 18px', borderRadius: 8, border: 'none', background: '#FF4D4D', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Saving…' : connected ? 'Update' : 'Connect'}
        </button>
      </div>
      {msg && (
        <p style={{ ...muted, marginTop: 10, marginBottom: 0, color: msg.kind === 'ok' ? '#6ee7a0' : '#fca5a5' }}>{msg.text}</p>
      )}
    </div>
  );
}

// styles
const muted = { fontSize: 14, lineHeight: 1.65, color: 'rgba(255,255,255,0.62)' };
const statGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.09)' };
const statCard = { background: '#070707', padding: '20px 22px' };
const panel = { background: '#070707', border: '1px solid rgba(255,255,255,0.12)', padding: '20px 22px' };
const sectionLabel = { fontSize: 11, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', margin: '0 0 14px' };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const th = { padding: '8px 10px', textAlign: 'right', fontSize: 10.5, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.12)' };
const td = { padding: '10px 10px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)' };
