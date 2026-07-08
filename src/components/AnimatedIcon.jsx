import { useEffect, useRef } from 'react';
import { createAnimatedIcon } from '../lib/animatedIcons';

/**
 * React wrapper around createAnimatedIcon(). Mounts the SVG once into a
 * span, and re-mounts if any of the inputs (name/size/color/strokeWidth)
 * change. The span carries `currentColor`, so styling the parent (e.g. an
 * .active sidebar nav item) tints the icon automatically.
 *
 * Why a wrapper: createAnimatedIcon attaches Web-Animations API listeners
 * directly to SVG nodes - much easier to do imperatively than to keep in
 * sync with React's diffing.
 */
export default function AnimatedIcon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = ''
}) {
  const ref = useRef(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    // Wipe any previous SVG (covers prop changes / hot reload) before
    // mounting a fresh one.
    host.innerHTML = '';
    const svg = createAnimatedIcon(name, { size, color, strokeWidth });
    if (!svg) return;
    host.appendChild(svg);

    // Hover-forwarding: the design calls for the animation to fire when the
    // user hovers the entire nav button, not just the icon glyph. Find the
    // closest hoverable parent (sidebar nav button, header icon button, or
    // bottom-nav button) and re-dispatch mouseenter/mouseleave on the SVG so
    // its own listeners pick them up.
    const navItem = host.closest(
      '.sidebar-nav-item, .header-msg-btn, .global-search-btn, .header-notification-btn, .header-home-btn, .bottom-nav .nav-item'
    );
    if (!navItem) return undefined;
    const onEnter = () => svg.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    const onLeave = () => svg.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    navItem.addEventListener('mouseenter', onEnter);
    navItem.addEventListener('mouseleave', onLeave);
    return () => {
      navItem.removeEventListener('mouseenter', onEnter);
      navItem.removeEventListener('mouseleave', onLeave);
    };
  }, [name, size, color, strokeWidth]);

  return (
    <span
      ref={ref}
      className={`animated-icon ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center', color }}
      aria-hidden="true"
    />
  );
}
