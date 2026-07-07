import React, { useState } from 'react';
import { connectSolana, connectEthereum, listWalletNfts, setNftBadge } from '../lib/nftBadge.js';

// ============================================================
// NftBadgePicker — Pro members connect a wallet, prove ownership,
// pick one of their NFTs, and set it as their badge icon.
// `userId` identifies the signer; `badgeId` is the held badge to set;
// `onIconSet(url)` fires once the verified NFT image is stored.
// ============================================================
export default function NftBadgePicker({ userId, badgeId, onIconSet }) {
  const [creds, setCreds] = useState(null);
  const [nfts, setNfts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const connect = async (chain) => {
    setBusy(true); setError(''); setStatus('Connecting wallet…'); setNfts([]); setSelected(null);
    try {
      const c = chain === 'solana' ? await connectSolana(userId) : await connectEthereum(userId);
      setCreds(c);
      setStatus('Loading your NFTs…');
      const list = await listWalletNfts(c);
      setNfts(list);
      setStatus(list.length ? '' : 'No NFTs with images found in that wallet.');
    } catch (e) {
      setError(e.message || 'Wallet connection failed');
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!creds || !selected) return;
    setBusy(true); setError(''); setStatus('Verifying ownership…');
    try {
      const url = await setNftBadge(creds, selected, badgeId);
      setStatus('NFT verified and set! Hit “Save badge” to finish.');
      if (onIconSet) onIconSet(url);
    } catch (e) {
      setError(e.message || 'Could not set NFT badge');
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={() => connect('solana')} style={btn}>
          🟣 Connect Phantom (Solana)
        </button>
        <button type="button" disabled={busy} onClick={() => connect('ethereum')} style={btn}>
          🦊 Connect MetaMask (Ethereum)
        </button>
      </div>

      {creds && (
        <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
          Connected: {creds.wallet.slice(0, 6)}…{creds.wallet.slice(-4)} ({creds.chain})
        </div>
      )}

      {nfts.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
          gap: '0.4rem', maxHeight: 220, overflowY: 'auto', padding: '0.25rem',
          border: '1px solid var(--border-color)', borderRadius: 8,
        }}>
          {nfts.map((n) => {
            const isSel = selected === n.id;
            return (
              <button key={n.id} type="button" title={n.name} onClick={() => setSelected(n.id)}
                style={{
                  padding: 2, borderRadius: 8, cursor: 'pointer', background: 'transparent',
                  border: `2px solid ${isSel ? '#4ECDC4' : 'transparent'}`, lineHeight: 0,
                }}>
                <img src={n.image} alt={n.name} loading="lazy"
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6 }} />
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <button type="button" disabled={busy} onClick={apply} style={{
          alignSelf: 'flex-start', padding: '0.4rem 0.9rem', borderRadius: 8, fontSize: '0.8rem',
          fontWeight: 700, cursor: busy ? 'default' : 'pointer', border: 'none',
          background: '#a855f7', color: '#fff',
        }}>{busy ? 'Verifying…' : 'Use this NFT'}</button>
      )}

      {status && <div style={{ fontSize: '0.75rem', color: '#4ECDC4' }}>{status}</div>}
      {error && <div style={{ fontSize: '0.75rem', color: '#ff6b6b' }}>{error}</div>}
    </div>
  );
}

const btn = {
  padding: '0.45rem 0.8rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
  cursor: 'pointer', border: '1px solid var(--border-color)', background: 'transparent',
  color: 'var(--text-primary)',
};
