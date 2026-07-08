import React, { useId } from 'react';

// ---------------------------------------------------------------------------
// FadeArc - a dual-gradient spinning arc SVG.
// Inspired by the loading-ui fade-arc spinner.
// ---------------------------------------------------------------------------
function FadeArc({ className, style, size = 24, ...props }) {
  const baseId = useId().replace(/:/g, '');
  const leadingGradientId = `${baseId}-leading`;
  const trailingGradientId = `${baseId}-trailing`;

  return (
    <>
      <style>{`
        @keyframes page-loader-fade-arc-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="status"
        aria-label="Loading spinner"
        className={className}
        width={size}
        height={size}
        style={{
          animationName: 'page-loader-fade-arc-spin',
          animationDuration: 'var(--pa-duration, 1s)',
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
          color: 'var(--accent-primary, #6b7280)',
          ...style,
        }}
        {...props}
      >
        <defs>
          <linearGradient
            id={leadingGradientId}
            x1="50%"
            x2="50%"
            y1="5.271%"
            y2="91.793%"
          >
            <stop offset="0%" stopColor="currentColor" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient
            id={trailingGradientId}
            x1="50%"
            x2="50%"
            y1="15.24%"
            y2="87.15%"
          >
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <g fill="none">
          <path
            d="M8.749.021a1.5 1.5 0 0 1 .497 2.958A7.5 7.5 0 0 0 3 10.375a7.5 7.5 0 0 0 7.5 7.5v3c-5.799 0-10.5-4.7-10.5-10.5C0 5.23 3.726.865 8.749.021"
            fill={`url(#${leadingGradientId})`}
            transform="translate(1.5 1.625)"
          />
          <path
            d="M15.392 2.673a1.5 1.5 0 0 1 2.119-.115A10.48 10.48 0 0 1 21 10.375c0 5.8-4.701 10.5-10.5 10.5v-3a7.5 7.5 0 0 0 5.007-13.084a1.5 1.5 0 0 1-.115-2.118"
            fill={`url(#${trailingGradientId})`}
            transform="translate(1.5 1.625)"
          />
        </g>
      </svg>
    </>
  );
}

// ---------------------------------------------------------------------------
// TextDots - animated trailing dots.  Typed as "Loading…" with the dots
// fading in sequence.
// ---------------------------------------------------------------------------
function TextDots({ className, style, children = 'Loading', dots = 3, ...props }) {
  const dotCount = Number.isFinite(dots) ? Math.max(1, Math.floor(dots)) : 3;

  return (
    <>
      <style>{`
        @keyframes page-loader-text-dots {
          0%, 100% { opacity: 0; }
          50%      { opacity: 1; }
        }
      `}</style>
      <span
        role="status"
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          color: 'var(--text-secondary, #a0a0a0)',
          fontSize: 'inherit',
          fontWeight: 500,
          ...style,
        }}
        {...props}
      >
        <span>{children}</span>
        <span aria-hidden="true" style={{ display:'inline-flex' }}>
          {Array.from({ length: dotCount }, (_, i) => (
            <span
              key={i}
              style={{
                animation: 'page-loader-text-dots var(--pa-dot-duration, 1.4s) infinite',
                animationDelay: `calc(var(--pa-dot-delay, 0.2s) * ${i + 1})`,
              }}
            >
              .
            </span>
          ))}
        </span>
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------
// PageLoader - spinner + "Loading…" side by side, both same size.
// Drop this into a Suspense fallback for a polished loading screen.
// ---------------------------------------------------------------------------
export default function PageLoader({ size = 20, text = 'Loading', className, style, ...props }) {
  return (
    <span
      className={className}
      role="status"
      aria-label={text}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        ...style,
      }}
      {...props}
    >
      <FadeArc size={size} />
      <TextDots
        style={{ fontSize: `${Math.round(size * 0.85)}px` }}
        dots={3}
      >
        {text}
      </TextDots>
    </span>
  );
}
