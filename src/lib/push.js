// Push-notification wiring for the native (Capacitor) shell.
//
// No-op in a normal web browser. On native it:
//   1. waits until a user is signed in (tokens are stored per-user),
//   2. requests the OS notification permission,
//   3. registers with the platform push service (FCM on Android, APNs on iOS),
//   4. upserts the device token into public.push_tokens (RLS: own rows only),
//   5. routes a notification tap to the right in-app screen.
//
// The server side (the send-push-notification edge function + the
// trg_send_push_notification trigger on public.notifications) already exists;
// it fans every notification row out to the user's tokens. This file is the
// missing client half that gets Android tokens into push_tokens.
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

let started = false;
let registeredForUser = null;

// Persist a freshly-issued device token for the current user. Idempotent:
// push_tokens has a UNIQUE(user_id, token), so re-registering the same device
// just bumps updated_at instead of creating duplicates.
async function saveToken(token) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !token) return;
  const platform = Capacitor.getPlatform(); // 'android' | 'ios'
  try {
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { user_id: user.id, token, platform, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' },
      );
    if (error) console.warn('[push] token upsert failed:', error.message);
  } catch (err) {
    console.warn('[push] token upsert threw:', String(err));
  }
}

// Map a notification's data payload to an in-app destination. The server sends
// { type, post_id?, comment_id?, actor_id?, community_id?, achievement_id? }.
// Post-related taps deep-link to /post/:id (a real route App.jsx parses on
// popstate). Everything else just opens the in-feed notifications view via a
// custom event App.jsx listens for - there is no /notifications URL, and
// profiles route by username (not the actor_id the payload carries).
function routeFromData(data) {
  if (!data) return;
  try {
    if (data.type === 'stream_live') {
      // Zeo go-live push - open the live tab on that stream (no URL route exists,
      // so App.jsx handles this via a custom event).
      window.dispatchEvent(new CustomEvent('prompted:open-stream', { detail: { streamId: data.stream_id || '' } }));
    } else if (data.type === 'message') {
      // DM/group push - open the Messages view.
      window.history.pushState({}, '', '/messages');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else if (data.post_id) {
      // post_like / comment / reply / remix / mention etc. - open the post.
      window.history.pushState({}, '', `/post/${data.post_id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      window.dispatchEvent(new CustomEvent('prompted:open-notifications'));
    }
  } catch (err) {
    console.warn('[push] routing failed:', String(err));
  }
}

async function registerNow(PushNotifications) {
  // requestPermissions() shows the OS prompt on Android 13+/iOS; on older
  // Android it resolves granted without a prompt.
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') {
    console.info('[push] notification permission not granted:', perm.receive);
    return;
  }
  // Triggers the 'registration' listener with the device token.
  await PushNotifications.register();
}

// Call once from the native bootstrap. Safe to call on web (returns immediately).
export async function initPush() {
  if (started || !Capacitor.isNativePlatform()) return;
  started = true;

  const { PushNotifications } = await import('@capacitor/push-notifications');

  // Android 8+ drops any notification posted to a channel that doesn't exist,
  // and neither the plugin nor the manifest default-channel meta-data CREATES
  // one - so create it explicitly. id must match the server's android.channel_id
  // and the manifest default_notification_channel_id ('prompted_default').
  if (Capacitor.getPlatform() === 'android') {
    try {
      await PushNotifications.createChannel({
        id: 'prompted_default',
        name: 'General',
        description: 'Likes, comments, follows and other activity',
        importance: 4, // HIGH - heads-up banner + sound
        visibility: 1, // PUBLIC on the lock screen
      });
    } catch (err) {
      console.warn('[push] createChannel failed:', String(err));
    }
  }

  // Token issued (or refreshed) - persist it for whoever is signed in.
  await PushNotifications.addListener('registration', (t) => {
    saveToken(t.value);
  });

  await PushNotifications.addListener('registrationError', (err) => {
    console.warn('[push] registration error:', JSON.stringify(err));
  });

  // Foreground delivery: the OS does NOT draw a tray notification while the app
  // is open. App.jsx already surfaces the notifications badge from the realtime
  // notifications table, so we just log here rather than double-notify.
  await PushNotifications.addListener('pushNotificationReceived', (n) => {
    console.info('[push] received in foreground:', n?.title);
  });

  // User tapped the notification in the tray - deep-link into the app.
  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    routeFromData(action?.notification?.data);
  });

  // Tokens are per-user, so (re)register whenever the signed-in user changes and
  // remove this device's tokens on sign-out so a shared device stops getting
  // the previous account's pushes.
  const syncForSession = async (session) => {
    const userId = session?.user?.id ?? null;
    if (userId && userId !== registeredForUser) {
      registeredForUser = userId;
      try {
        await registerNow(PushNotifications);
      } catch (err) {
        console.warn('[push] register failed:', String(err));
      }
    } else if (!userId && registeredForUser) {
      const prevUser = registeredForUser;
      registeredForUser = null;
      try {
        await supabase.from('push_tokens').delete().eq('user_id', prevUser);
      } catch {
        /* best-effort cleanup */
      }
    }
  };

  const { data: { session } } = await supabase.auth.getSession();
  await syncForSession(session);
  supabase.auth.onAuthStateChange((_event, s) => { syncForSession(s); });
}
