import React, { useState, useEffect, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function BadgeTabs({ items, active, setActive, className = "" }) {
  const [internalActive, setInternalActive] = useState(active);
  const [isPending, startTransition] = useTransition();

  // Sync with external active state
  useEffect(() => {
    setInternalActive(active);
  }, [active]);

  return (
    <div className={`badge-tabs-wrapper ${className}`} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <div 
        style={{
          position: 'relative',
          display: 'flex',
          gap: '0.25rem',
          background: 'rgba(255,255,255,0.03)',
          padding: '0.25rem',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          width: '100%',
          maxWidth: '400px'
        }}
      >
        {items.map((item) => {
          const isActive = item.value === internalActive;
          return (
            <motion.button
              key={item.value}
              onClick={() => {
                // Update visually immediately so the pill animation starts smoothly
                setInternalActive(item.value);
                // Defer the heavy parent route change to not block the animation thread
                setTimeout(() => {
                  startTransition(() => {
                    setActive(item.value);
                  });
                }, 120);
              }}
              style={{
                position: 'relative',
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: isActive ? '#000' : 'var(--text-secondary)',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                transition: 'color 0.2s ease',
                zIndex: 1,
                outline: 'none',
                whiteSpace: 'nowrap'
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isActive && (
                <motion.div
                  layoutId="badge-tabs-pill"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'var(--accent-primary)',
                    borderRadius: '8px',
                    zIndex: -1
                  }}
                  initial={false}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}

              <span style={{ position: 'relative', zIndex: 10, color: isActive ? '#000' : 'inherit' }}>
                {item.label}
              </span>

              <AnimatePresence mode="popLayout">
                {item.badge !== undefined && item.badge > 0 && (
                  <motion.span
                    key={item.badge}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    style={{
                      marginLeft: '0.5rem',
                      position: 'relative',
                      zIndex: 10,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '20px',
                      height: '20px',
                      padding: '0 6px',
                      borderRadius: '999px',
                      background: isActive ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
                      color: isActive ? '#000' : 'var(--text-secondary)',
                      fontSize: '0.7rem',
                      fontWeight: 'bold',
                    }}
                  >
                    {item.badge}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
