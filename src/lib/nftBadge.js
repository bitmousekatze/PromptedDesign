import { supabase } from './supabase';

// ============================================================
// NFT badge client helpers
// ------------------------------------------------------------
// Connect a wallet, sign an ownership message, then talk to the
// `nft-badge` edge function which verifies the signature server-side,
// confirms NFT ownership (Helius / Alchemy) and re-hosts the image.
// ============================================================

const buildMessage = (userId, wallet, chain) =>
  [
    'Prompted NFT badge verification',
    `User: ${userId}`,
    `Wallet: ${wallet}`,
    `Chain: ${chain}`,
    `Issued: ${new Date().toISOString()}`,
  ].join('\n');

// ---- Solana (Phantom) ----------------------------------------------
export const connectSolana = async (userId) => {
  const provider = window.solana;
  if (!provider || !provider.isPhantom) {
    throw new Error('Phantom wallet not found. Install it to use a Solana NFT.');
  }
  const resp = await provider.connect();
  const wallet = resp.publicKey.toString();
  const message = buildMessage(userId, wallet, 'solana');
  const { signature } = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
  // Uint8Array -> base64 (what the edge function expects for Solana).
  const signatureB64 = btoa(String.fromCharCode(...signature));
  return { chain: 'solana', wallet, message, signature: signatureB64 };
};

// ---- Ethereum (MetaMask / EIP-1193) --------------------------------
export const connectEthereum = async (userId) => {
  const eth = window.ethereum;
  if (!eth) {
    throw new Error('No Ethereum wallet found. Install MetaMask to use an Ethereum NFT.');
  }
  const accounts = await eth.request({ method: 'eth_requestAccounts' });
  const wallet = accounts?.[0];
  if (!wallet) throw new Error('No wallet account available.');
  const message = buildMessage(userId, wallet, 'ethereum');
  const signature = await eth.request({ method: 'personal_sign', params: [message, wallet] });
  return { chain: 'ethereum', wallet, message, signature };
};

// ---- Edge-function calls -------------------------------------------
const invoke = async (body) => {
  const { data, error } = await supabase.functions.invoke('nft-badge', { body });
  if (error) {
    // Surface the function's JSON error message when present.
    let msg = error.message;
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch { /* ignore */ }
    throw new Error(msg || 'NFT request failed');
  }
  if (data?.error) throw new Error(data.error);
  return data;
};

// List NFTs held by the connected wallet.
export const listWalletNfts = async (creds) => {
  const { nfts } = await invoke({ action: 'list', ...creds });
  return nfts || [];
};

// Verify ownership of the chosen NFT and set it as the badge icon.
export const setNftBadge = async (creds, nftId, badgeId) => {
  const { iconUrl } = await invoke({ action: 'set', ...creds, nftId, badgeId });
  return iconUrl;
};
