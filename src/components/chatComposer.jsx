import { useState, useEffect } from 'react';

// Shared rich-composer bits for live chats (Cafeteria + community channels):
// emoji picker, Giphy GIF search, image rendering styles. One source of truth so both
// chats behave identically. CSS classes are prefixed `cafe-` for historical reasons
// (first used in the Cafeteria) and injected once via <ChatComposerStyles/>.

// Optional Giphy client key (VITE_-prefixed → in the bundle). Without it the GIF tab
// shows an "add a key" note; emoji + image upload still work.
export const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY || '';

// Curated emoji set (no heavy dependency).
export const EMOJIS = '😀 😂 🤣 😊 😍 😎 🤓 🥳 😭 😅 😉 🙂 🙃 😴 🤔 🤯 😱 🥺 😤 😡 👍 👎 👏 🙌 🤝 💪 🙏 🤙 ✌️ 🫡 🔥 ✨ 🎉 🎊 💯 ⭐ 🌟 ⚡ 💥 🏆 🥇 🎓 📚 💡 🚀 🛠️ 🧠 👀 💀 🤖 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 🍕 🍔 🍟 🌮 🍣 🍩 🍪 ☕ 🧋 🍿 🎮 😈 👻 🤡 🐐 🦾'.split(' ');

export function EmojiPicker({ onPick, onClose }) {
  return (
    <div className="cafe-pop" onMouseLeave={onClose}>
      <div className="cafe-pop-head">Emoji</div>
      <div className="cafe-emoji-grid">
        {EMOJIS.map((e, i) => (
          <button key={i} type="button" className="cafe-emoji" onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
    </div>
  );
}

export function GifPicker({ onPick, onClose }) {
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!GIPHY_KEY) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const base = q.trim()
          ? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(q.trim())}&limit=24&rating=pg-13`
          : `https://api.giphy.com/v1/gifs/trending?limit=24&rating=pg-13`;
        const res = await fetch(`${base}&api_key=${GIPHY_KEY}`);
        const json = await res.json();
        if (!cancelled) setGifs(json?.data || []);
      } catch { if (!cancelled) setGifs([]); }
      finally { if (!cancelled) setLoading(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  return (
    <div className="cafe-pop cafe-gif-pop">
      <div className="cafe-pop-head">
        <input className="cafe-gif-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={GIPHY_KEY ? 'Search GIFs…' : 'GIF search needs a Giphy key'} disabled={!GIPHY_KEY} />
        <button type="button" className="cafe-pop-close" onClick={onClose}>✕</button>
      </div>
      {!GIPHY_KEY ? (
        <div className="cafe-gif-empty">Add <code>VITE_GIPHY_API_KEY</code> to enable GIF search. You can still upload GIFs with the image button.</div>
      ) : loading ? (
        <div className="cafe-gif-empty">Searching…</div>
      ) : gifs.length === 0 ? (
        <div className="cafe-gif-empty">No GIFs found.</div>
      ) : (
        <div className="cafe-gif-grid">
          {gifs.map((g) => {
            const url = g.images?.fixed_height?.url || g.images?.original?.url;
            const thumb = g.images?.fixed_height_small?.url || url;
            return <button key={g.id} type="button" className="cafe-gif-item" onClick={() => onPick(url)}><img src={thumb} alt={g.title || 'gif'} loading="lazy" /></button>;
          })}
        </div>
      )}
      <div className="cafe-gif-attribution">Powered by GIPHY</div>
    </div>
  );
}

export function ChatComposerStyles() {
  return (
    <style>{`
      .cafe-img-wrap{ display:inline-block; margin-top:4px; max-width:320px; }
      .cafe-img{ max-width:320px; max-height:280px; border-radius:10px; border:1px solid #26303f; display:block; }
      .cafe-composer{ position:relative; }
      .cafe-tools{ display:flex; align-items:flex-end; gap:2px; padding-right:4px; }
      .cafe-tool-btn{ background:transparent; border:none; color:#94a3b8; font-size:18px; cursor:pointer; width:34px; height:34px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; transition:background .15s, color .15s; }
      .cafe-tool-btn:hover{ background:#1b2331; color:#e6edf3; }
      .cafe-tool-btn:disabled{ opacity:.5; cursor:default; }
      .cafe-gif-btn{ font-weight:800; font-size:11px; font-family:ui-monospace,monospace; border:1px solid #26303f; width:auto; padding:0 9px; }
      .cafe-pop{ position:absolute; bottom:calc(100% + 8px); left:8px; width:320px; max-height:300px; background:#141a24; border:1px solid #26303f; border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.5); z-index:30; display:flex; flex-direction:column; overflow:hidden; }
      .cafe-pop-head{ display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border-bottom:1px solid #26303f; font-size:12px; font-weight:700; color:#94a3b8; }
      .cafe-pop-close{ background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px; }
      .cafe-emoji-grid{ display:grid; grid-template-columns:repeat(8,1fr); gap:2px; padding:8px; overflow-y:auto; }
      .cafe-emoji{ background:none; border:none; font-size:20px; cursor:pointer; border-radius:6px; padding:4px; line-height:1; }
      .cafe-emoji:hover{ background:#1b2331; }
      .cafe-gif-pop{ width:340px; max-height:400px; }
      .cafe-gif-search{ flex:1; background:#0d1117; border:1px solid #26303f; border-radius:8px; padding:6px 10px; color:#e6edf3; font-size:13px; outline:none; }
      .cafe-gif-grid{ display:grid; grid-template-columns:repeat(2,1fr); gap:6px; padding:8px; overflow-y:auto; }
      .cafe-gif-item{ background:none; border:none; padding:0; cursor:pointer; border-radius:8px; overflow:hidden; line-height:0; }
      .cafe-gif-item img{ width:100%; height:100px; object-fit:cover; display:block; transition:transform .15s; }
      .cafe-gif-item:hover img{ transform:scale(1.05); }
      .cafe-gif-empty{ padding:18px; color:#94a3b8; font-size:13px; text-align:center; line-height:1.5; }
      .cafe-gif-empty code{ background:#0d1117; padding:1px 5px; border-radius:4px; }
      .cafe-gif-attribution{ padding:5px 10px; font-size:9px; color:#5b6675; text-align:right; border-top:1px solid #26303f; }
      .cafe-tease{ position:relative; }
      .cafe-tease-blur{ filter:blur(6px); opacity:.55; pointer-events:none; user-select:none; padding:8px 0; }
      .cafe-tease-lock{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:20px; }
      .cafe-tease-card{ background:rgba(20,26,36,.94); border:1px solid #26303f; border-radius:16px; padding:22px 24px; max-width:360px; text-align:center; box-shadow:0 16px 50px rgba(0,0,0,.55); }
      .cafe-tease-icon{ font-size:34px; }
      .cafe-tease-card h3{ margin:8px 0 6px; color:#e6edf3; }
      .cafe-tease-card p{ margin:0; color:#94a3b8; font-size:13px; line-height:1.5; }
      .cafe-spin{ display:inline-block; animation:cafeSpin 1s linear infinite; }
      @keyframes cafeSpin{ to{ transform:rotate(360deg); } }
    `}</style>
  );
}
