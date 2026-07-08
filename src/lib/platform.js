import { Capacitor } from '@capacitor/core';

// True when running inside the native Capacitor shell (Android/iOS app),
// false in a normal web browser. Used to gate behavior that differs between
// the web app and the packaged mobile app (e.g. Play Store billing policy:
// the Pro purchase flow and web AdSense are hidden inside the native app).
export const isNativeApp = () => Capacitor.isNativePlatform();

export const isAndroidApp = () => Capacitor.getPlatform() === 'android';
export const isIosApp = () => Capacitor.getPlatform() === 'ios';

// Custom-scheme deep link Google/GitHub OAuth redirects back to. Must be
// registered as an intent-filter in AndroidManifest.xml AND added to the
// Supabase Auth "Redirect URLs" allowlist.
export const OAUTH_REDIRECT = 'com.prmpted.app://auth-callback';
