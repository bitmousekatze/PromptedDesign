import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  REPORT_PLATFORMS,
  buildReportData,
  buildSummaryText,
  mergeExtracted,
  extractAnalytics,
  submitWeeklyReport,
  fetchWeeklyReport,
} from '../lib/weeklyReports';

// ── Access ────────────────────────────────────────────────────────────────
// Who can FILL OUT a report: platform admins, anyone with the SocialMarketer
// role (by username), or anyone who enters the access PIN. Viewing a saved
// report via ?id= bypasses this gate and relies on the table's RLS instead
// (so a recipient like Jack can open the download link without the PIN).
const ACCESS_PIN = '271940';
const SOCIAL_MARKETER_USERNAMES = [
  // Add the marketing lead's @username here to grant the role without the PIN.
];
// Who receives the report on submit (their Prompted @usernames). The DM + the
// read-only download link go to these people.
const REPORT_RECIPIENT_USERNAMES = [
  'herz',   // Jack
  'mouse',  // owner
];

const num = (s) => parseFloat(s) || 0;
const fmt = (n) => n.toLocaleString();

export default function WeeklyReportPage({
  currentUser,
  profile,
  isPlatformAdmin,
  reportId,
  onBack,
  onRequireAuth,
  addToast,
  onOpenMessages,
}) {
  const toast = (m, t) => (addToast ? addToast(m, t) : null);
  const isViewMode = !!reportId;

  // ── Role / PIN gate ──────────────────────────────────────────────────────
  const isMarketer =
    isPlatformAdmin ||
    (profile?.username && SOCIAL_MARKETER_USERNAMES.includes(profile.username));
  const [unlocked, setUnlocked] = useState(
    () => isMarketer || sessionStorage.getItem('wsr_unlocked') === '1'
  );
  const [pin, setPin] = useState('');

  const tryPin = (e) => {
    e?.preventDefault?.();
    if (pin.trim() === ACCESS_PIN) {
      sessionStorage.setItem('wsr_unlocked', '1');
      setUnlocked(true);
    } else {
      toast('Incorrect PIN', 'error');
    }
  };

  // ── Form state (flat field map keyed by the original HTML ids) ───────────
  const [f, setF] = useState(() => ({ reportDate: new Date().toISOString().split('T')[0] }));
  const set = useCallback((id, val) => setF((p) => ({ ...p, [id]: val })), []);
  const fieldVal = (id) => f[id] ?? '';

  // ── Saved-report view state ──────────────────────────────────────────────
  const [viewReport, setViewReport] = useState(null);
  const [viewLoading, setViewLoading] = useState(isViewMode);
  const [viewError, setViewError] = useState('');

  useEffect(() => {
    if (!isViewMode) return;
    let alive = true;
    (async () => {
      setViewLoading(true);
      const { report, error } = await fetchWeeklyReport(supabase, reportId);
      if (!alive) return;
      if (error || !report) {
        setViewError(error || "Report not found — or you don't have access to it.");
      } else {
        setViewReport(report);
      }
      setViewLoading(false);
    })();
    return () => { alive = false; };
  }, [isViewMode, reportId]);

  // ── Totals ───────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let posts = 0, views = 0, eng = 0;
    for (const p of REPORT_PLATFORMS) {
      posts += num(f[`${p.id}_posts`]);
      views += num(f[`${p.id}_views`]);
      eng += num(f[`${p.id}_engagement`]);
    }
    return { posts, views, eng };
  }, [f]);
  const fChange = num(f.followers_end) - num(f.followers_start);
  const eChange = (num(f.engagement_rate_end) - num(f.engagement_rate_start));

  // ── Auto-fill (URL / paste / screenshot) ─────────────────────────────────
  const [importText, setImportText] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState('');
  const fileRef = useRef(null);

  const applyExtraction = (extracted, loginWall, sourceLabel) => {
    if (loginWall) {
      setImportNote(
        `That link is a login-gated analytics dashboard, so its numbers aren't readable from the URL. Paste a screenshot of the dashboard instead — I'll read it the same way.`
      );
      return;
    }
    setF((prev) => mergeExtracted(prev, extracted));
    setImportNote(`✅ Filled in from ${sourceLabel}. Review the numbers below, then submit.`);
    toast('Auto-filled — review the numbers', 'success');
  };

  const runImport = async (payload, sourceLabel) => {
    if (!currentUser) { onRequireAuth?.(); return; }
    setImporting(true);
    setImportNote('');
    try {
      const { data, error, loginWall } = await extractAnalytics(supabase, payload);
      if (error) { setImportNote(`⚠️ ${error}`); toast(error, 'error'); return; }
      applyExtraction(data, loginWall, sourceLabel);
    } finally {
      setImporting(false);
    }
  };

  const importFromText = () => {
    if (!importText.trim()) { toast('Paste your analytics text first', 'error'); return; }
    runImport({ mode: 'text', text: importText }, 'pasted text');
  };
  const importFromUrl = () => {
    if (!importUrl.trim()) { toast('Paste a link first', 'error'); return; }
    runImport({ mode: 'url', url: importUrl.trim() }, 'the link');
  };
  const importFromImage = (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast('Image too large (max 8MB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.split(',')[1];
      const mediaType = (dataUrl.match(/^data:([^;]+);/) || [])[1] || file.type || 'image/png';
      runImport({ mode: 'image', image: base64, mediaType }, 'the screenshot');
    };
    reader.readAsDataURL(file);
  };

  // ── Local save ───────────────────────────────────────────────────────────
  const downloadJSON = () => {
    const data = buildReportData(f);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prompted_social_report_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };
  const clearForm = () => {
    if (!window.confirm('Clear all data? This cannot be undone.')) return;
    setF({ reportDate: new Date().toISOString().split('T')[0] });
  };

  // ── Submit & send via DM ─────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // { id, link }

  const handleSubmit = async () => {
    if (!currentUser) { onRequireAuth?.(); return; }
    if (REPORT_RECIPIENT_USERNAMES.length === 0) {
      toast('No recipients configured yet — ask the admin to set them.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const data = buildReportData(f);
      const summary = buildSummaryText(f);
      const { id, error } = await submitWeeklyReport(supabase, {
        data, summary, recipients: REPORT_RECIPIENT_USERNAMES,
      });
      if (error || !id) { toast(error || 'Could not send report', 'error'); return; }
      const link = `${window.location.origin}/weekly-report?id=${id}`;
      setSubmitted({ id, link });
      toast('Report sent ✅', 'success');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render: saved-report (read-only download) view ───────────────────────
  if (isViewMode) {
    return (
      <div className="wsr">
        <WsrStyle />
        <main>
          <button className="wsr-back" onClick={onBack}>← Back</button>
          {viewLoading && <p className="wsr-muted">Loading report…</p>}
          {viewError && <div className="wsr-alert err">{viewError}</div>}
          {viewReport && <SavedReportView report={viewReport} />}
        </main>
      </div>
    );
  }

  // ── Render: not logged in ────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className="wsr">
        <WsrStyle />
        <main>
          <button className="wsr-back" onClick={onBack}>← Back</button>
          <h2>Weekly Social Media Report</h2>
          <p className="wsr-muted">Please log in to fill out and submit the weekly report.</p>
          <button className="wsr-btn primary" onClick={() => onRequireAuth?.()}>Log in</button>
        </main>
      </div>
    );
  }

  // ── Render: PIN gate ─────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="wsr">
        <WsrStyle />
        <main>
          <button className="wsr-back" onClick={onBack}>← Back</button>
          <div className="wsr-pin">
            <h2>Weekly Report</h2>
            <p className="wsr-muted">Enter the access PIN to open the report form.</p>
            <form onSubmit={tryPin} className="wsr-pin-form">
              <input
                type="password" inputMode="numeric" autoFocus
                placeholder="••••••" value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
              <button className="wsr-btn primary" type="submit">Unlock</button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // ── Render: success state ────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="wsr">
        <WsrStyle />
        <main>
          <div className="wsr-success">
            <div className="wsr-success-icon">✅</div>
            <h2>Report sent</h2>
            <p className="wsr-muted">
              Your report was saved and sent via DM to {REPORT_RECIPIENT_USERNAMES.map((u) => '@' + u).join(' and ')}.
              They can open the link to view and download it.
            </p>
            <div className="wsr-linkbox">
              <input readOnly value={submitted.link} onFocus={(e) => e.target.select()} />
              <button className="wsr-btn" onClick={() => { navigator.clipboard?.writeText(submitted.link); toast('Link copied', 'success'); }}>Copy link</button>
            </div>
            <div className="wsr-success-actions">
              <button className="wsr-btn" onClick={() => onOpenMessages?.()}>Open Messages</button>
              <button className="wsr-btn" onClick={() => { setSubmitted(null); clearForm(); }}>New report</button>
              <button className="wsr-btn" onClick={onBack}>Done</button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Render: the form ─────────────────────────────────────────────────────
  const T = (id, props = {}) => (
    <textarea value={fieldVal(id)} onChange={(e) => set(id, e.target.value)} {...props} />
  );
  const I = (id, type = 'text', props = {}) => (
    <input type={type} value={fieldVal(id)} onChange={(e) => set(id, e.target.value)} {...props} />
  );

  return (
    <div className="wsr">
      <WsrStyle />
      <main>
        <button className="wsr-back" onClick={onBack}>← Back</button>

        <div className="section">
          <div className="section-label">00 · Report Info</div>
          <h2>Weekly Social Media Report</h2>
          <p>Track platform performance, surface high-impact content, and plan data-driven improvements for next week.</p>

          {/* AUTO-FILL */}
          <div className="wsr-import">
            <div className="wsr-import-head">⚡ Auto-fill from your analytics</div>
            <p className="wsr-muted" style={{ margin: '0 0 12px' }}>
              Paste a screenshot or the raw text from your X / Instagram / TikTok analytics and it fills the form for you — no typing. You can still paste a public link; login-gated dashboards need a screenshot.
            </p>

            <div className="wsr-import-row">
              <input
                type="url" placeholder="Paste an analytics or post link…"
                value={importUrl} onChange={(e) => setImportUrl(e.target.value)}
              />
              <button className="wsr-btn" disabled={importing} onClick={importFromUrl}>From link</button>
            </div>

            <textarea
              placeholder="…or paste the raw analytics text here (numbers, captions, anything)"
              value={importText} onChange={(e) => setImportText(e.target.value)}
              style={{ marginTop: 10 }}
            />
            <div className="wsr-import-actions">
              <button className="wsr-btn" disabled={importing} onClick={importFromText}>From text</button>
              <button className="wsr-btn" disabled={importing} onClick={() => fileRef.current?.click()}>📷 Upload screenshot</button>
              <input ref={fileRef} type="file" accept="image/*" hidden
                onChange={(e) => { importFromImage(e.target.files?.[0]); e.target.value = ''; }} />
              {importing && <span className="wsr-muted">Reading…</span>}
            </div>
            {importNote && <div className="wsr-alert info" style={{ marginTop: 12 }}>{importNote}</div>}
          </div>

          <div className="info-grid">
            <div className="info-box"><label>Week Of</label>{I('weekOf', 'date')}</div>
            <div className="info-box"><label>Report Date</label>{I('reportDate', 'date')}</div>
            <div className="info-box"><label>Manager Name</label>{I('managerName', 'text', { placeholder: 'Your name' })}</div>
            <div className="info-box"><label>Email</label>{I('managerEmail', 'email', { placeholder: 'you@prmpted.com' })}</div>
          </div>
        </div>

        {/* POST ACTIVITY */}
        <div className="section">
          <div className="section-label">01 · Analytics</div>
          <h2>Post Activity</h2>
          <p>Posts, views, and engagement per platform. Totals update automatically.</p>
          {REPORT_PLATFORMS.map((p) => (
            <div className="platform-card" key={p.id}>
              <div className="pc-head">{p.emoji} {p.name}</div>
              <div className="pc-grid">
                <div><span className="mini-label">Posts</span>{I(`${p.id}_posts`, 'number', { min: 0 })}</div>
                <div className="topics full"><span className="mini-label">Topics / Types</span>{I(`${p.id}_topics`)}</div>
                <div><span className="mini-label">Views</span>{I(`${p.id}_views`, 'number', { min: 0 })}</div>
                <div><span className="mini-label">Engagement</span>{I(`${p.id}_engagement`, 'number', { min: 0 })}</div>
              </div>
            </div>
          ))}
          <div className="stat-grid">
            <div className="stat-box"><div className="stat-value">{fmt(totals.posts)}</div><div className="stat-label">Total Posts</div></div>
            <div className="stat-box"><div className="stat-value">{fmt(totals.views)}</div><div className="stat-label">Total Views</div></div>
            <div className="stat-box"><div className="stat-value">{fmt(totals.eng)}</div><div className="stat-label">Engagement</div></div>
          </div>
        </div>

        {/* PERFORMANCE */}
        <div className="section">
          <div className="section-label">02 · Analysis</div>
          <h2>Performance Deep Dive</h2>
          <p>Your best and worst content this week — and why.</p>
          <div className="perf-box">
            <h4>🏆 Best Performing Post</h4>
            <div className="form-group"><label>Post Link / Description</label>{I('best_post_link', 'text', { placeholder: 'URL or post title' })}</div>
            <div className="form-group"><label>Views</label>{I('best_post_views', 'number', { min: 0, placeholder: '0' })}</div>
            <div className="form-group"><label>Why it worked</label>{T('best_post_why', { placeholder: 'Timing, format, topic, hook, audience fit…' })}</div>
          </div>
          <div className="perf-box">
            <h4>📉 Worst Performing Post</h4>
            <div className="form-group"><label>Post Link / Description</label>{I('worst_post_link', 'text', { placeholder: 'URL or post title' })}</div>
            <div className="form-group"><label>Views</label>{I('worst_post_views', 'number', { min: 0, placeholder: '0' })}</div>
            <div className="form-group"><label>Why it underperformed</label>{T('worst_post_why', { placeholder: 'What would you change next time?' })}</div>
          </div>
        </div>

        {/* GROWTH */}
        <div className="section">
          <div className="section-label">03 · Metrics</div>
          <h2>Audience &amp; Growth</h2>
          <p>Week-over-week follower and engagement movement.</p>
          <div className="metric-card">
            <div className="mc-title">Total Followers</div>
            <div className="mc-grid">
              <div><span className="mini-label">Start</span>{I('followers_start', 'number', { min: 0 })}</div>
              <div><span className="mini-label">End</span>{I('followers_end', 'number', { min: 0 })}</div>
              <div><span className="mini-label">Change</span><div className="mc-change">{fChange >= 0 ? '+' : ''}{fmt(fChange)}</div></div>
            </div>
          </div>
          <div className="metric-card">
            <div className="mc-title">Engagement Rate (%)</div>
            <div className="mc-grid">
              <div><span className="mini-label">Start</span>{I('engagement_rate_start', 'number', { min: 0, step: 0.1 })}</div>
              <div><span className="mini-label">End</span>{I('engagement_rate_end', 'number', { min: 0, step: 0.1 })}</div>
              <div><span className="mini-label">Change</span><div className="mc-change">{eChange >= 0 ? '+' : ''}{eChange.toFixed(2)}%</div></div>
            </div>
          </div>
          <div className="metric-card">
            <div className="mc-title">New Followers</div>
            <div className="form-group" style={{ marginBottom: 0 }}>{I('new_followers', 'number', { min: 0, placeholder: '0' })}</div>
          </div>
          <div className="form-group">
            <label>Audience Demographics</label>
            <small>Age, gender, location, top interests — if you have them.</small>
            {T('demographics', { placeholder: '18–24 (40%), 25–34 (35%), DE 50%, US 25%, interests: AI, design…' })}
          </div>
        </div>

        {/* ANALYSIS */}
        <div className="section">
          <div className="section-label">04 · Insights</div>
          <h2>Weekly Analysis</h2>
          <h3>✅ What went well</h3>
          <div className="form-group">{T('went_well', { placeholder: 'Wins, positive trends, momentum…' })}</div>
          <h3>⚠️ Challenges &amp; lessons</h3>
          <div className="form-group">{T('challenges', { placeholder: 'Obstacles, low performers, what you learned…' })}</div>
        </div>

        {/* FEATURES */}
        <div className="section">
          <div className="section-label">05 · Development</div>
          <h2>Feature Requests</h2>
          <p>What would help marketing or users? Goes straight to the dev team.</p>
          {[1, 2, 3].map((n) => (
            <div className="feature-card" key={n}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <span className="mini-label">Feature / Tool</span>
                {I(`feature${n}_name`, 'text', { placeholder: 'What do you need?' })}
              </div>
              <div className="fc-row">
                <div><span className="mini-label">Priority</span>
                  <select value={fieldVal(`feature${n}_priority`)} onChange={(e) => set(`feature${n}_priority`, e.target.value)}>
                    <option value="">—</option><option>High</option><option>Medium</option><option>Low</option>
                  </select>
                </div>
                <div><span className="mini-label">For</span>
                  <select value={fieldVal(`feature${n}_for`)} onChange={(e) => set(`feature${n}_for`, e.target.value)}>
                    <option value="">—</option><option>Marketing</option><option>Users</option><option>Both</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ margin: '10px 0 0' }}>
                <span className="mini-label">Description &amp; expected impact</span>
                {T(`feature${n}_desc`, { placeholder: 'What would it do, and why does it help?', style: { minHeight: 64 } })}
              </div>
            </div>
          ))}
        </div>

        {/* NEXT WEEK */}
        <div className="section">
          <div className="section-label">06 · Planning</div>
          <h2>Next Week Action Plan</h2>
          <div className="wsr-alert ok">
            <strong>🎯 The question:</strong> What can management / developers do to make advertising easier and more effective next week?
          </div>
          <div className="form-group">
            <label>Support requests &amp; action items</label>
            <small>Tools, budget, approvals, dashboard access, process fixes…</small>
            {T('action_plan', { placeholder: 'e.g. cross-platform scheduling tool, approval for ad budget, analytics access…' })}
          </div>
        </div>

        {/* NOTES */}
        <div className="section">
          <div className="section-label">07 · Miscellaneous</div>
          <h2>Notes</h2>
          <div className="form-group">
            <label>Anything else?</label>
            {T('additional_notes', { placeholder: 'Market trends, competitor moves, creative ideas, constraints…' })}
          </div>
        </div>

        {/* CONTROLS */}
        <div className="controls">
          <button className="primary" disabled={submitting} onClick={handleSubmit}>
            {submitting ? 'Sending…' : '📨 Submit & send to the team'}
          </button>
          <button onClick={() => window.print()}>🖨️ Print / Save PDF</button>
          <button onClick={downloadJSON}>📥 Export JSON</button>
          <button onClick={clearForm}>🗑️ Clear</button>
        </div>
      </main>
    </div>
  );
}

// ── Read-only saved report ──────────────────────────────────────────────────
function SavedReportView({ report }) {
  const d = report.data || {};
  const g = d.growth || {};
  const platforms = d.platforms || {};
  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `weekly_report_${report.week_of || report.id}.json`;
    a.click();
  };
  const Row = ({ k, v }) => (
    <div className="sr-row"><span>{k}</span><b>{v || '—'}</b></div>
  );
  return (
    <>
      <div className="section-label">Weekly Report</div>
      <h2>Social Media Report — week of {d.weekOf || report.week_of || '—'}</h2>
      <p className="wsr-muted">Prepared by {d.manager || report.manager_name || '—'}</p>

      <div className="controls noprint" style={{ margin: '8px 0 28px' }}>
        <button className="primary" onClick={() => window.print()}>🖨️ Download / Print PDF</button>
        <button onClick={downloadJSON}>📥 Download JSON</button>
      </div>

      <h3>Post Activity</h3>
      {REPORT_PLATFORMS.map((p) => {
        const pd = platforms[p.name];
        if (!pd) return null;
        return (
          <div className="platform-card" key={p.id}>
            <div className="pc-head">{p.emoji} {p.name}</div>
            <div className="sr-stats">
              <span>Posts <b>{pd.posts || '0'}</b></span>
              <span>Views <b>{pd.views || '0'}</b></span>
              <span>Engagement <b>{pd.engagement || '0'}</b></span>
              <span>Topics <b>{pd.topics || '—'}</b></span>
            </div>
          </div>
        );
      })}

      <h3>Audience &amp; Growth</h3>
      <div className="perf-box">
        <Row k="Followers" v={`${g.followersStart || '0'} → ${g.followersEnd || '0'}`} />
        <Row k="New followers" v={g.newFollowers} />
        <Row k="Engagement rate" v={`${g.engagementStart || '0'}% → ${g.engagementEnd || '0'}%`} />
        <Row k="Demographics" v={g.demographics} />
      </div>

      <h3>Performance</h3>
      <div className="perf-box">
        <Row k="🏆 Best post" v={`${d.bestPost?.link || '—'} (${d.bestPost?.views || '0'} views)`} />
        <p className="wsr-muted">{d.bestPost?.why}</p>
        <Row k="📉 Worst post" v={`${d.worstPost?.link || '—'} (${d.worstPost?.views || '0'} views)`} />
        <p className="wsr-muted">{d.worstPost?.why}</p>
      </div>

      <h3>Analysis</h3>
      <div className="perf-box">
        <b>✅ What went well</b><p className="wsr-muted">{d.wentWell || '—'}</p>
        <b>⚠️ Challenges</b><p className="wsr-muted">{d.challenges || '—'}</p>
      </div>

      {(d.features || []).some((x) => x.name) && (
        <>
          <h3>Feature Requests</h3>
          {(d.features || []).filter((x) => x.name).map((x, i) => (
            <div className="feature-card" key={i}>
              <b>{x.name}</b> <span className="wsr-muted">({x.priority || '?'} · {x.for || '?'})</span>
              <p className="wsr-muted" style={{ margin: '6px 0 0' }}>{x.desc}</p>
            </div>
          ))}
        </>
      )}

      <h3>Next Week Action Plan</h3>
      <div className="perf-box"><p className="wsr-muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.actionPlan || '—'}</p></div>

      {d.notes && (<>
        <h3>Notes</h3>
        <div className="perf-box"><p className="wsr-muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.notes}</p></div>
      </>)}
    </>
  );
}

// ── Scoped styles (ported from Weekly_Social_Media_Report.html) ──────────────
function WsrStyle() {
  return (
    <style>{`
    .wsr { --bg:#0a0a0a; --bg2:#111; --bg3:#1a1a1a; --border:#2a2a2a; --text:#f0f0f0; --muted:#888; --gold:#C9A227; --teal:#4ECDC4; --blue:#4796E3; --green:#10A37F;
      background:var(--bg); color:var(--text); font-size:15px; line-height:1.65; min-height:100vh; }
    .wsr * { box-sizing:border-box; }
    .wsr main { max-width:880px; margin:0 auto; padding:32px 24px 80px; }
    .wsr .wsr-back { background:none; border:none; color:var(--muted); font:inherit; cursor:pointer; padding:0; margin-bottom:20px; font-size:14px; }
    .wsr .wsr-back:hover { color:var(--teal); }
    .wsr h2 { font-size:25px; font-weight:700; letter-spacing:-0.5px; margin:0 0 12px; color:#fff; }
    .wsr h3 { font-size:16px; font-weight:600; margin:26px 0 10px; color:var(--gold); }
    .wsr h4 { font-size:14px; font-weight:600; color:var(--gold); margin:0 0 14px; text-transform:uppercase; letter-spacing:.5px; }
    .wsr p { color:#c8c8c8; margin:0 0 14px; }
    .wsr .wsr-muted { color:var(--muted); }
    .wsr .section { margin-bottom:40px; }
    .wsr .section-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:1.5px; color:var(--teal); margin-bottom:8px; }
    .wsr input, .wsr textarea, .wsr select { width:100%; background:var(--bg2); border:1px solid var(--border); color:var(--text); font-family:inherit; font-size:16px; padding:10px 12px; border-radius:6px; }
    .wsr textarea { resize:vertical; min-height:88px; font-size:14px; line-height:1.55; }
    .wsr input:focus, .wsr textarea:focus, .wsr select:focus { outline:none; border-color:var(--teal); box-shadow:0 0 0 2px rgba(78,205,196,.12); }
    .wsr .mini-label { display:block; font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted); margin-bottom:4px; }
    .wsr .form-group { margin-bottom:16px; }
    .wsr .form-group > label { display:block; font-weight:600; margin-bottom:6px; color:#fff; font-size:13px; text-transform:uppercase; letter-spacing:.5px; }
    .wsr .form-group small { display:block; color:var(--muted); font-size:12px; margin:2px 0 8px; }
    .wsr .info-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin:18px 0; }
    .wsr .info-box { background:var(--bg3); border:1px solid var(--border); padding:14px; border-radius:8px; }
    .wsr .info-box label { display:block; font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted); margin-bottom:8px; }
    .wsr .platform-card { background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:16px; margin-bottom:12px; }
    .wsr .pc-head { font-weight:600; font-size:15px; color:#fff; margin-bottom:12px; }
    .wsr .pc-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .wsr .pc-grid .full { grid-column:1 / -1; }
    .wsr .stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin:16px 0; }
    .wsr .stat-box { background:var(--bg3); border:1px solid var(--border); padding:18px 14px; border-radius:8px; text-align:center; }
    .wsr .stat-value { font-size:24px; font-weight:700; color:var(--teal); margin-bottom:2px; }
    .wsr .stat-label { font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; }
    .wsr .metric-card { background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:16px; margin-bottom:12px; }
    .wsr .mc-title { font-weight:600; color:#fff; margin-bottom:12px; font-size:15px; }
    .wsr .mc-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; align-items:end; }
    .wsr .mc-change { font-size:18px; font-weight:700; color:var(--teal); padding:8px 0; text-align:center; }
    .wsr .perf-box, .wsr .feature-card { background:var(--bg3); border:1px solid var(--border); padding:16px; border-radius:8px; margin:0 0 12px; }
    .wsr .fc-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px; }
    .wsr .wsr-alert { padding:14px 16px; border-radius:8px; font-size:14px; border-left:3px solid; }
    .wsr .wsr-alert.info { background:rgba(71,150,227,.08); border-left-color:var(--blue); color:#a8d5ff; }
    .wsr .wsr-alert.ok { background:rgba(16,163,127,.08); border-left-color:var(--green); color:#7de8d4; margin-bottom:16px; }
    .wsr .wsr-alert.err { background:rgba(217,119,87,.1); border-left-color:#D97757; color:#ffbfa8; }
    .wsr .controls { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:36px 0 0; }
    .wsr .controls button { padding:13px 16px; background:var(--bg3); border:1px solid var(--border); color:var(--text); font:inherit; font-size:13px; font-weight:600; border-radius:8px; cursor:pointer; text-transform:uppercase; letter-spacing:.5px; }
    .wsr .controls button:hover { border-color:var(--teal); color:var(--teal); }
    .wsr .controls button.primary { background:var(--teal); color:var(--bg); border-color:var(--teal); grid-column:1 / -1; }
    .wsr .wsr-btn { padding:10px 14px; background:var(--bg3); border:1px solid var(--border); color:var(--text); font:inherit; font-size:13px; font-weight:600; border-radius:6px; cursor:pointer; }
    .wsr .wsr-btn:hover { border-color:var(--teal); color:var(--teal); }
    .wsr .wsr-btn.primary { background:var(--teal); color:var(--bg); border-color:var(--teal); }
    .wsr .wsr-btn[disabled] { opacity:.5; cursor:default; }
    .wsr .wsr-import { background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:18px; margin:18px 0; }
    .wsr .wsr-import-head { font-weight:700; color:#fff; margin-bottom:6px; font-size:15px; }
    .wsr .wsr-import-row { display:flex; gap:8px; }
    .wsr .wsr-import-row input { flex:1; }
    .wsr .wsr-import-row button, .wsr .wsr-import-actions button { white-space:nowrap; }
    .wsr .wsr-import-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:10px; }
    .wsr .wsr-pin { max-width:360px; margin:60px auto; text-align:center; }
    .wsr .wsr-pin-form { display:flex; gap:8px; margin-top:16px; }
    .wsr .wsr-pin-form input { text-align:center; letter-spacing:4px; }
    .wsr .wsr-success { max-width:520px; margin:40px auto; text-align:center; }
    .wsr .wsr-success-icon { font-size:48px; margin-bottom:8px; }
    .wsr .wsr-linkbox { display:flex; gap:8px; margin:18px 0; }
    .wsr .wsr-linkbox input { flex:1; font-size:13px; }
    .wsr .wsr-success-actions { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
    .wsr .sr-row { display:flex; justify-content:space-between; gap:16px; padding:6px 0; border-bottom:1px solid var(--border); font-size:14px; }
    .wsr .sr-row:last-child { border-bottom:none; }
    .wsr .sr-row span { color:var(--muted); }
    .wsr .sr-stats { display:flex; flex-wrap:wrap; gap:16px; font-size:14px; color:var(--muted); }
    .wsr .sr-stats b { color:var(--text); }
    @media (max-width:480px){ .wsr .stat-grid{grid-template-columns:1fr;} .wsr .mc-grid{grid-template-columns:1fr;} .wsr .controls{grid-template-columns:1fr;} }
    @media print { .wsr .wsr-back, .wsr .controls, .wsr .noprint, .wsr .wsr-import { display:none !important; } .wsr, .wsr main { background:#fff; color:#000; } }
    `}</style>
  );
}
