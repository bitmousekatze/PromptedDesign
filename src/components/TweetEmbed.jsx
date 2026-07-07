import { useEffect, useRef, useState } from 'react';
import { parseTweetId, buildTweetEmbedSrc, tweetWatchUrl } from '../lib/tweets';

// Renders a single X (Twitter) tweet in a sandboxed iframe using X's official
// platform.twitter.com embed endpoint. The embed has no fixed height, so we
// listen for the resize postMessage it sends to its parent and grow the iframe
// to fit. We trust only messages from our OWN iframe AND the twitter origin —
// the same source-check guard the games iframe uses (src/pages/GamesPage.jsx).
export default function TweetEmbed({ url, theme = 'dark' }) {
  const id = parseTweetId(url);
  const src = buildTweetEmbedSrc(id, { theme });
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(320);

  useEffect(() => {
    if (!src) return undefined;
    const onMsg = (e) => {
      if (e.origin !== 'https://platform.twitter.com') return;
      // Only trust the resize message coming from THIS tweet's iframe.
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      let data = e.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
      const embed = data && data['twttr.embed'];
      const p = embed && Array.isArray(embed.params) ? embed.params[0] : null;
      // Height has lived under params[0].height and params[0].data.height across
      // widget versions — accept either.
      const h = p && (p.height ?? (p.data && p.data.height));
      if (h && Number.isFinite(Number(h))) setHeight(Math.ceil(Number(h)));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [src]);

  if (!src) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={fallbackStyle}>
        View on X ↗
      </a>
    );
  }

  return (
    <div style={wrapStyle}>
      <iframe
        ref={iframeRef}
        src={src}
        title="Tweet"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        loading="lazy"
        scrolling="no"
        style={{ width: '100%', height, border: 0, display: 'block' }}
      />
    </div>
  );
}

const wrapStyle = {
  width: '100%', borderRadius: 14, overflow: 'hidden', background: '#15181d',
  border: '1px solid #20242c',
};
const fallbackStyle = {
  display: 'inline-block', padding: '10px 14px', borderRadius: 12,
  background: 'rgba(29,155,240,0.12)', border: '1px solid rgba(29,155,240,0.35)',
  color: '#1d9bf0', textDecoration: 'none', fontWeight: 700, fontSize: 14,
};
