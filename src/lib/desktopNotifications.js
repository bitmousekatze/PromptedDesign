// Desktop notifications for the web app — two cooperating layers:
//
//   1. FOREGROUND (no service worker): while a Prompted tab is open in the
//      background, NotificationListener (App.jsx) calls showDesktopNotif() to
//      draw a native OS notification. Works everywhere the Notification API does.
//
//   2. WEB PUSH (service worker + VAPID): so notifications arrive even with the
//      tab/browser closed. We register /sw.js, subscribe via PushManager with our
//      VAPID public key, and store the subscription in public.web_push_subscriptions.
//      The send-push-notification edge function fans every `notifications` row out
//      to those subscriptions (the web twin of the APNs/FCM push_tokens path).
//
// Default is OFF: we never prompt on load. The user opts in from the Settings
// toggle (a user gesture), which is also what browsers require for requestPermission.
import { supabase } from './supabase';

// Public VAPID key (raw P-256 point, base64url). Public by design — it ships in
// the bundle; the matching private key lives only in the edge function secrets.
// Must equal the VAPID_PUBLIC_KEY secret set on the send-push-notification fn.
export const VAPID_PUBLIC_KEY =
  'BLBAvQtMPk2OvdTEFsIF2rm9sw6Osa_OW3EapGaZPScoo3vlWmQavqjwjA17h-fz05Mm-hy076kU1HGps8ZVcCk';

const PREF_KEY = 'prompted:desktopNotifs'; // '1' = on, anything else = off
const SW_URL = '/sw.js';
const SW_SCOPE = '/';

// ── capability checks ───────────────────────────────────────────────────────
export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}
export function webPushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window
  );
}
export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

// ── user preference (per-device; "notify THIS machine") ─────────────────────
export function desktopNotifsEnabled() {
  try {
    return localStorage.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}
function setPref(on) {
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0');
  } catch {
    /* private mode / storage disabled — ignore */
  }
}

// ── base64url <-> bytes ─────────────────────────────────────────────────────
function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bufToUrlB64(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── FOREGROUND notification ─────────────────────────────────────────────────
// Mirrors the in-app toast copy. Suppressed when the tab is focused (the toast
// already covers that) so we never double-notify.
export function showDesktopNotif({ title, body, tag, icon, data, onClick }) {
  if (!notificationsSupported() || !desktopNotifsEnabled()) return;
  if (Notification.permission !== 'granted') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) {
    return;
  }
  try {
    const n = new Notification(title || 'Prompted', {
      body: body || '',
      tag: tag || undefined,
      icon: icon || '/logo-icon.svg',
      badge: '/logo-icon.svg',
      data: data || {},
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      if (onClick) onClick();
      else routeFromData(data);
      n.close();
    };
  } catch {
    // Some browsers (notably Chrome) forbid the Notification constructor and
    // require ServiceWorkerRegistration.showNotification. Fall back to that.
    try {
      navigator.serviceWorker?.ready?.then((reg) => {
        reg.showNotification(title || 'Prompted', {
          body: body || '',
          tag: tag || undefined,
          icon: icon || '/logo-icon.svg',
          badge: '/logo-icon.svg',
          data: data || {},
        });
      });
    } catch {
      /* give up silently */
    }
  }
}

// Deep-link a foreground notification click. Background clicks are handled by the
// service worker (public/sw.js); this is the in-page twin for foreground clicks.
export function routeFromData(data) {
  if (!data || typeof window === 'undefined') return;
  try {
    if (data.type === 'stream_live') {
      window.dispatchEvent(new CustomEvent('prompted:open-stream', { detail: { streamId: data.stream_id || '' } }));
    } else if (data.post_id) {
      window.history.pushState({}, '', `/post/${data.post_id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      window.dispatchEvent(new CustomEvent('prompted:open-notifications'));
    }
  } catch {
    /* routing best-effort */
  }
}

// ── WEB PUSH (service worker + subscription) ────────────────────────────────
async function registerServiceWorker() {
  if (!webPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    if (existing) return existing;
    return await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  } catch (err) {
    console.warn('[push] service worker registration failed:', String(err));
    return null;
  }
}

// Persist (or refresh) a PushSubscription for the signed-in user. Idempotent:
// web_push_subscriptions has UNIQUE(endpoint), so re-subscribing the same browser
// just bumps the row instead of duplicating.
async function saveSubscription(sub) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !sub) return false;
  const json = sub.toJSON ? sub.toJSON() : null;
  const p256dh = json?.keys?.p256dh || (sub.getKey && bufToUrlB64(sub.getKey('p256dh')));
  const auth = json?.keys?.auth || (sub.getKey && bufToUrlB64(sub.getKey('auth')));
  if (!sub.endpoint || !p256dh || !auth) return false;
  try {
    const { error } = await supabase.from('web_push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh,
        auth,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
    if (error) {
      console.warn('[push] subscription upsert failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[push] subscription upsert threw:', String(err));
    return false;
  }
}

async function subscribeToPush() {
  const reg = await registerServiceWorker();
  if (!reg) return false;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    return await saveSubscription(sub);
  } catch (err) {
    console.warn('[push] subscribe failed:', String(err));
    return false;
  }
}

// ── public on/off API (called from the Settings toggle) ─────────────────────
// Returns: 'granted' | 'denied' | 'unsupported'
export async function enableDesktopNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  let perm = Notification.permission;
  if (perm !== 'granted') perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'unsupported';

  setPref(true);
  // Best-effort: subscribe to Web Push for closed-tab delivery. Even if this
  // fails (no SW support, blocked), foreground notifications still work.
  if (webPushSupported()) {
    await subscribeToPush();
  }
  return 'granted';
}

export async function disableDesktopNotifications() {
  setPref(false);
  if (!webPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await supabase.from('web_push_subscriptions').delete().eq('endpoint', endpoint);
    }
  } catch (err) {
    console.warn('[push] disable failed:', String(err));
  }
}

// Called once on app load (and on auth change). If the user has opted in and
// already granted permission, make sure the SW is registered and the
// subscription is fresh in the DB. No prompt, no-op when off.
export async function initWebPush() {
  if (!notificationsSupported() || !desktopNotifsEnabled()) return;
  if (Notification.permission !== 'granted') return;
  if (!webPushSupported()) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await subscribeToPush();
}
