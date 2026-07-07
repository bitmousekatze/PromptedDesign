import { supabase, setReadOnlyMode } from './supabase';

// Site-wide read-only flag (site_settings row 1, flipped by admins via the
// set_read_only_mode RPC). Polled every 60s so a flip propagates to every
// open tab within a minute — deliberately NOT Realtime: the table isn't in
// the publication, and we're shrinking that publication, not growing it.
//
// Loaded for its side effects from main.jsx; components subscribe via
// onSiteSettings for live updates (MaintenanceBanner drives its countdown
// off this).

// spotlight_hidden defaults true (fail-closed): if the settings fetch never
// lands, the June winner cards stay in roulette mode rather than leaking the
// results before the live announcement.
const DEFAULTS = { read_only: false, read_only_message: null, back_online_at: null, spotlight_hidden: true };

let settings = DEFAULTS;
const listeners = new Set();

export const getSiteSettings = () => settings;

// Subscribe to changes; immediately invoked with the current value.
// Returns an unsubscribe function.
export const onSiteSettings = (fn) => {
  listeners.add(fn);
  fn(settings);
  return () => listeners.delete(fn);
};

const apply = (row) => {
  settings = { ...DEFAULTS, ...row };
  setReadOnlyMode(settings.read_only);
  listeners.forEach((fn) => fn(settings));
};

export async function refreshSiteSettings() {
  // maybeSingle + silent failure: if the table doesn't exist yet (deploy raced
  // the migration) or the network hiccups, we stay in the last known state —
  // which defaults to writable.
  const { data, error } = await supabase
    .from('site_settings')
    .select('read_only, read_only_message, back_online_at, spotlight_hidden')
    .eq('id', 1)
    .maybeSingle();
  if (!error && data) apply(data);
  return settings;
}

refreshSiteSettings();
setInterval(refreshSiteSettings, 60_000);
