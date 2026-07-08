import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

// Pro-only contests. Each contest is backed by its own Pro-only community:
// "Join contest" joins that community (gated to active Pros), and members post
// their builds there with the normal community composer. Admins create/edit/close
// contests; creating one spins up its community automatically (create_pro_contest).
// Each contest supports up to 3 prize slots (1st / 2nd / 3rd).
const MEDALS = ['🥇', '🥈', '🥉'];

export default function ProContests({ currentUser, isPro, isPlatformAdmin, addToast, onRequireAuth, onOpenCommunity }) {
  const [contests, setContests] = useState([]);
  const [joined, setJoined] = useState(new Set()); // community_ids the user already belongs to
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: cs, error } = await supabase
      .from('pro_contests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      addToast?.(error.message, 'error');
      setLoading(false);
      return;
    }
    setContests(cs || []);
    // Which of these contest communities has the user already joined?
    const commIds = (cs || []).map((c) => c.community_id).filter(Boolean);
    if (currentUser && commIds.length) {
      const { data: mems } = await supabase
        .from('community_members')
        .select('community_id')
        .eq('user_id', currentUser.id)
        .in('community_id', commIds);
      setJoined(new Set((mems || []).map((m) => m.community_id)));
    } else {
      setJoined(new Set());
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p style={muted}>Loading contests…</p>;

  return (
    <div>
      {isPlatformAdmin && (
        <div style={{ marginBottom: 24 }}>
          <button className="btn btn-secondary" style={smallBtn} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : '+ New contest (admin)'}
          </button>
          {showCreate && (
            <ContestForm
              addToast={addToast}
              onDone={() => { setShowCreate(false); load(); }}
              onCancel={() => setShowCreate(false)}
            />
          )}
        </div>
      )}

      {!contests.length && (
        <div style={emptyBox}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No contests yet</div>
          <p style={{ ...muted, margin: 0 }}>
            Pro-only contests with real prizes run here. The next one will land in your notifications - stay tuned.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 18 }}>
        {contests.map((c) => (
          <ContestCard
            key={c.id}
            contest={c}
            joined={joined.has(c.community_id)}
            currentUser={currentUser}
            isPro={isPro}
            isPlatformAdmin={isPlatformAdmin}
            addToast={addToast}
            onRequireAuth={onRequireAuth}
            onOpenCommunity={onOpenCommunity}
            onChanged={load}
          />
        ))}
      </div>
    </div>
  );
}

function prizeListOf(contest) {
  // Prefer the prizes[] array; fall back to the legacy single `prize`.
  if (Array.isArray(contest.prizes) && contest.prizes.length) return contest.prizes.filter(Boolean);
  return contest.prize ? [contest.prize] : [];
}

function ContestCard({ contest, joined, currentUser, isPro, isPlatformAdmin, addToast, onRequireAuth, onOpenCommunity, onChanged }) {
  const [entering, setEntering] = useState(false);
  const [editing, setEditing] = useState(false);
  const isOpen = contest.status === 'active' && (!contest.ends_at || new Date(contest.ends_at) > new Date());
  const prizes = prizeListOf(contest);

  const setStatus = async (status) => {
    const { error } = await supabase.from('pro_contests').update({ status }).eq('id', contest.id);
    if (error) { addToast?.(error.message, 'error'); return; }
    addToast?.(`Contest marked ${status}`, 'success');
    onChanged();
  };

  // Join (idempotent) the contest's Pro community, then navigate into it so the
  // member can post their build with the normal community composer.
  const enterContest = async () => {
    if (!currentUser) { onRequireAuth?.(); return; }
    if (!contest.community_id) { addToast?.('This contest has no space yet.', 'error'); return; }
    setEntering(true);
    try {
      const { data, error } = await supabase.rpc('join_pro_contest', { p_contest_id: contest.id });
      if (error) throw error;
      if (!joined) addToast?.("You're in! Post your build in the contest space.", 'success');
      onOpenCommunity?.(data);
      onChanged();
    } catch (e) {
      addToast?.(e.message || 'Could not join the contest.', 'error');
    } finally {
      setEntering(false);
    }
  };

  if (editing) {
    return (
      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>
          Edit contest
        </div>
        <ContestForm
          existing={contest}
          addToast={addToast}
          onDone={() => { setEditing(false); onChanged(); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={cardTitle}>{contest.title}</h3>
            <span style={{ ...statusTag, ...(isOpen ? statusOpen : {}) }}>
              {isOpen ? 'Open' : contest.status === 'judging' ? 'Judging' : contest.status === 'ended' ? 'Ended' : contest.status}
            </span>
          </div>
          {contest.description && <p style={{ ...muted, marginTop: 8 }}>{contest.description}</p>}

          {prizes.length > 0 && (
            <div style={{ display: 'grid', gap: 4, marginTop: 12 }}>
              {prizes.map((p, i) => (
                <div key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                  <span style={{ marginRight: 6 }}>{MEDALS[i] || '🏆'}</span>
                  <strong style={{ color: '#fff' }}>{p}</strong>
                </div>
              ))}
            </div>
          )}

          {contest.ends_at && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>
              ⏳ {isOpen ? 'Ends' : 'Ended'} {new Date(contest.ends_at).toLocaleDateString()}
            </div>
          )}
        </div>
        {isPlatformAdmin && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn" style={smallBtn} onClick={() => setEditing(true)}>Edit</button>
            {contest.status === 'active' && (
              <button className="btn" style={smallBtn} onClick={() => setStatus('judging')}>Close entries</button>
            )}
            {contest.status !== 'ended' && (
              <button className="btn" style={smallBtn} onClick={() => setStatus('ended')}>End</button>
            )}
          </div>
        )}
      </div>

      {/* Entry actions - submitting a build means joining the contest's Pro
          community and posting there. */}
      {isPro ? (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {joined ? (
            <>
              <button className="btn btn-primary" style={smallBtn} disabled={entering} onClick={enterContest}>
                {entering ? 'Opening…' : 'Open contest space →'}
              </button>
              <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>
                ✓ You're in - post your build in the contest community.
              </span>
            </>
          ) : isOpen ? (
            <button className="btn btn-primary" style={smallBtn} disabled={entering} onClick={enterContest}>
              {entering ? 'Joining…' : 'Join contest'}
            </button>
          ) : (
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>This contest is closed.</span>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 14, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
          🔒 Prompted Pro members can join this contest and post their build.
        </div>
      )}
    </div>
  );
}

// Convert an ISO timestamp to the value a <input type="datetime-local"> expects.
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Create (RPC, also makes the Pro community) or edit (direct admin update) a contest.
function ContestForm({ existing, addToast, onDone, onCancel }) {
  const initialPrizes = existing ? prizeListOf(existing) : [];
  const [title, setTitle] = useState(existing?.title || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [prize1, setPrize1] = useState(initialPrizes[0] || '');
  const [prize2, setPrize2] = useState(initialPrizes[1] || '');
  const [prize3, setPrize3] = useState(initialPrizes[2] || '');
  const [endsAt, setEndsAt] = useState(toLocalInput(existing?.ends_at));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) { addToast?.('Title required', 'error'); return; }
    // Order matters (1st/2nd/3rd); drop blank slots, cap at 3.
    const prizes = [prize1, prize2, prize3].map((p) => p.trim()).filter(Boolean).slice(0, 3);
    const endsIso = endsAt ? new Date(endsAt).toISOString() : null;
    setSaving(true);
    try {
      if (existing) {
        // Admin edit - direct update (pro_contests UPDATE is admin-gated by RLS).
        const { error } = await supabase
          .from('pro_contests')
          .update({
            title: title.trim(),
            description: description.trim() || null,
            prizes: prizes.length ? prizes : null,
            prize: prizes[0] || null, // keep legacy column in sync
            ends_at: endsIso,
          })
          .eq('id', existing.id);
        if (error) throw error;
        addToast?.('Contest updated', 'success');
      } else {
        // Create - RPC also spins up the backing Pro-only community.
        const { error } = await supabase.rpc('create_pro_contest', {
          p_title: title.trim(),
          p_description: description.trim() || null,
          p_prizes: prizes,
          p_ends_at: endsIso,
        });
        if (error) throw error;
        addToast?.('Contest is live - its Pro community is ready', 'success');
      }
      onDone();
    } catch (e) {
      addToast?.(e.message || 'Failed to save contest', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 520, border: '1px solid rgba(255,255,255,0.12)', padding: 16, marginTop: existing ? 0 : 12 }}>
      <input className="form-input" placeholder="Contest title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      <textarea className="form-input" placeholder="Rules / theme / judging criteria" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />

      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Prizes (up to 3 - leave blank to skip)</div>
      <input className="form-input" placeholder="🥇 1st place prize" value={prize1} onChange={(e) => setPrize1(e.target.value)} maxLength={200} />
      <input className="form-input" placeholder="🥈 2nd place prize" value={prize2} onChange={(e) => setPrize2(e.target.value)} maxLength={200} />
      <input className="form-input" placeholder="🥉 3rd place prize" value={prize3} onChange={(e) => setPrize3(e.target.value)} maxLength={200} />

      <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
        Deadline (optional)
        <input className="form-input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={{ marginTop: 4 }} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" style={smallBtn} disabled={saving} onClick={submit}>
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Launch contest'}
        </button>
        <button className="btn" style={smallBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// styles - same monochrome editorial language as ProPage
const card = { background: '#070707', border: '1px solid rgba(255,255,255,0.12)', padding: '22px 24px' };
const cardTitle = { margin: 0, fontSize: 19, fontWeight: 500, fontFamily: "Georgia, 'Times New Roman', serif" };
const muted = { fontSize: 14, lineHeight: 1.65, color: 'rgba(255,255,255,0.62)' };
const statusTag = { fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', padding: '3px 8px', border: '1px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.6)' };
const statusOpen = { border: '1px solid #6ee7a0', color: '#6ee7a0' };
const emptyBox = { border: '1px dashed rgba(255,255,255,0.2)', padding: '28px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.7)' };
const smallBtn = { fontSize: 12, padding: '6px 12px' };
