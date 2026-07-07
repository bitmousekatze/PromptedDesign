import { useEffect, useRef, useState } from 'react';
import { parseTweetId, parseInstagram, buildInstagramEmbedSrc } from '../lib/tweets';
import TweetEmbed from './TweetEmbed.jsx';

// Routes an embeddable social URL to the right renderer: X tweets via TweetEmbed,
// Instagram posts/reels via the official instagram.com/.../embed iframe. Same
// "store the URL, rebuild the embed at render" approach as the Twitch/X embeds.
export default function SocialEmbed({ url }) {
  if (parseTweetId(url)) return <TweetEmbed url={url} />;
  const ig = parseInstagram(url);
  if (ig) return <InstagramEmbed ig={ig} url={url} />;
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={fallbackStyle}>View link ↗</a>
  );
}

function InstagramEmbed({ ig, url }) {
  const src = buildInstagramEmbedSrc(ig);
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(560);

  // Instagram's embed posts a {type:'MEASURE', details:{height}} message to the
  // parent. Trust only messages from instagram.com AND this iframe.
  useEffect(() => {
    if (!src) return undefined;
    const onMsg = (e) => {
      if (!/instagram\.com$/.test((() => { try { return new URL(e.origin).hostname; } catch { return ''; } })())) return;
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      let data = e.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
      const h = data?.type === 'MEASURE' && data?.details?.height;
      if (h && Number.isFinite(Number(h))) setHeight(Math.min(900, Math.ceil(Number(h))));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [src]);

  if (!src) {
    return <a href={url} target="_blank" rel="noopener noreferrer" style={fallbackStyle}>View on Instagram ↗</a>;
  }
  return (
    <div style={wrapStyle}>
      <iframe
        ref={iframeRef}
        src={src}
        title="Instagram post"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        loading="lazy"
        scrolling="no"
        style={{ width: '100%', height, border: 0, display: 'block', background: '#fff' }}
      />
    </div>
  );
}

const wrapStyle = {
  width: '100%', maxWidth: 540, borderRadius: 14, overflow: 'hidden',
  background: '#fff', border: '1px solid #20242c',
};
const fallbackStyle = {
  display: 'inline-block', padding: '10px 14px', borderRadius: 12,
  background: 'rgba(225,48,108,0.12)', border: '1px solid rgba(225,48,108,0.35)',
  color: '#e1306c', textDecoration: 'none', fontWeight: 700, fontSize: 14,
};
