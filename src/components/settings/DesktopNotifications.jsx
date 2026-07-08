// DesktopNotifications - Settings → Desktop Notifications toggle.
// Design doc: docs/DESKTOP_NOTIFICATIONS_DESIGN.html
//
// Opt-in (default OFF). Turning it on requests OS permission and subscribes this
// browser to Web Push so notifications arrive even when the tab is closed. All the
// real work lives in src/lib/desktopNotifications.js; this is just the UI.

import { useEffect, useState } from 'react';
import {
  notificationsSupported,
  notificationPermission,
  desktopNotifsEnabled,
  enableDesktopNotifications,
  disableDesktopNotifications,
} from '../../lib/desktopNotifications';

export default function DesktopNotifications() {
  const [supported] = useState(() => notificationsSupported());
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState('default');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(desktopNotifsEnabled());
    setPermission(notificationPermission());
  }, []);

  const blocked = permission === 'denied';

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (enabled) {
        await disableDesktopNotifications();
        setEnabled(false);
      } else {
        const result = await enableDesktopNotifications();
        setPermission(notificationPermission());
        setEnabled(result === 'granted');
      }
    } finally {
      setBusy(false);
    }
  };

  const on = enabled && !blocked;

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">🔔 Desktop Notifications</h3>
      <p style={{ color: '#888', fontSize: 13, margin: '0 0 14px', lineHeight: 1.6 }}>
        Get a native notification on this device when someone likes, comments, follows, reposts,
        or mentions you - even when Prompted isn’t the tab you’re looking at. We never notify while
        you’re actively on the page.
      </p>

      {!supported ? (
        <p style={{ color: '#666', fontSize: 13 }}>
          This browser doesn’t support desktop notifications.
        </p>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              background: '#111',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              padding: '12px 14px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {on ? 'Notifications on for this device' : 'Notifications off'}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {blocked
                  ? 'Blocked in your browser settings'
                  : on
                  ? 'You’ll be notified even when Prompted is closed'
                  : 'Turn on to enable'}
              </div>
            </div>
            <button
              role="switch"
              aria-checked={on}
              onClick={handleToggle}
              disabled={busy || blocked}
              title={blocked ? 'Unblock notifications in your browser settings first' : ''}
              style={{
                position: 'relative',
                width: 46,
                height: 26,
                flexShrink: 0,
                borderRadius: 999,
                border: 'none',
                cursor: busy || blocked ? 'not-allowed' : 'pointer',
                background: on ? '#10A37F' : '#2a2a2a',
                opacity: busy || blocked ? 0.6 : 1,
                transition: 'background 0.15s ease',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  left: on ? 23 : 3,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.15s ease',
                }}
              />
            </button>
          </div>

          {blocked && (
            <p style={{ color: '#D97757', fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
              Notifications are blocked for this site. Click the lock icon in your browser’s address
              bar, allow notifications, then reload and try again.
            </p>
          )}
        </>
      )}
    </div>
  );
}
