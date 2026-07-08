const badges = [
  { name: "Newbie", tier: 1, color: "#6B7280", accent: "#9CA3AF", glow: "rgba(107,114,128,0.2)" },
  { name: "Tinkerer", tier: 2, color: "#4A9E6E", accent: "#6FCF97", glow: "rgba(74,158,110,0.3)" },
  { name: "Builder", tier: 3, color: "#CD7F32", accent: "#E8A854", glow: "rgba(205,127,50,0.35)" },
  { name: "Craftsman", tier: 4, color: "#A8B4C0", accent: "#D1DAE3", glow: "rgba(168,180,192,0.4)" },
  { name: "Architect", tier: 5, color: "#F5C518", accent: "#FFE066", glow: "rgba(245,197,24,0.45)" },
  { name: "Innovator", tier: 6, color: "#00D4FF", accent: "#76F7FF", glow: "rgba(0,212,255,0.45)" },
  { name: "Visionary", tier: 7, color: "#B76BFF", accent: "#D9A8FF", glow: "rgba(183,107,255,0.5)" },
  { name: "Grandmaster", tier: 8, color: "#FF2D55", accent: "#FF6B8A", glow: "rgba(255,45,85,0.5)" },
  { name: "Legend", tier: 9, color: "#FFD700", accent: "#FFFACD", glow: "rgba(255,215,0,0.65)" },
];

const THRESHOLDS = [0, 250, 1000, 2500, 6000, 12000, 22000, 45000, 100000];

export function getBadgeForPoints(points = 0) {
  let badge = badges[0];
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (points >= THRESHOLDS[i]) badge = badges[i];
  }
  return badge;
}

export function getAllBadgeTiers() {
  return badges.map((badge, i) => ({
    ...badge,
    minPoints: THRESHOLDS[i],
    nextThreshold: THRESHOLDS[i + 1] || null,
  }));
}

export { badges as BADGE_TIERS };

export function BadgeSVG({ badge, size = 20 }) {
  const { name, tier, color, accent, glow } = badge;
  const id = `r-${name.toLowerCase().replace(/\s/g, "")}-${Math.random().toString(36).slice(2, 6)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: tier >= 5
          ? `drop-shadow(0 0 ${Math.min(tier * 2, 14)}px ${glow})`
          : "none",
        flexShrink: 0,
      }}
    >
      <defs>
        <linearGradient id={`mg-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
        <linearGradient id={`bg-${id}`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#1e1e38" />
          <stop offset="100%" stopColor="#0d0d1f" />
        </linearGradient>
        <radialGradient id={`rg-${id}`} cx="50%" cy="38%" r="45%">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        {tier >= 4 && (
          <linearGradient id={`sm-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0">
              <animate attributeName="offset" values="-0.5;1.5" dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="white" stopOpacity="0.12">
              <animate attributeName="offset" values="0;2" dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="white" stopOpacity="0">
              <animate attributeName="offset" values="0.5;2.5" dur="3s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        )}
        <clipPath id={`cp-${id}`}>
          <path d="M32 4 L58 20 L58 44 L32 60 L6 44 L6 20 Z" />
        </clipPath>
      </defs>

      {tier >= 8 && (
        <path d="M32 1 L61 18.5 L61 45.5 L32 63 L3 45.5 L3 18.5 Z"
          fill="none" stroke={color} strokeWidth="0.8" opacity="0.3">
          <animate attributeName="opacity" values="0.15;0.5;0.15" dur="2s" repeatCount="indefinite" />
        </path>
      )}

      {tier >= 9 && (
        <path d="M32 -1 L63 17.5 L63 46.5 L32 65 L1 46.5 L1 17.5 Z"
          fill="none" stroke={accent} strokeWidth="0.5" opacity="0.2">
          <animate attributeName="opacity" values="0.1;0.35;0.1" dur="2.8s" repeatCount="indefinite" />
        </path>
      )}

      {tier >= 6 && tier < 8 && (
        <path d="M32 2 L60 19.5 L60 44.5 L32 62 L4 44.5 L4 19.5 Z"
          fill="none" stroke={color} strokeWidth="0.6" opacity="0.2">
          <animate attributeName="opacity" values="0.1;0.35;0.1" dur="2.5s" repeatCount="indefinite" />
        </path>
      )}

      <path d="M32 4 L58 20 L58 44 L32 60 L6 44 L6 20 Z"
        fill={`url(#bg-${id})`}
        stroke={`url(#mg-${id})`}
        strokeWidth={tier >= 8 ? 2 : tier >= 4 ? 1.5 : 1}
      />

      <path d="M32 4 L58 20 L58 44 L32 60 L6 44 L6 20 Z"
        fill={`url(#rg-${id})`} />

      {tier >= 4 && (
        <path d="M32 4 L58 20 L58 44 L32 60 L6 44 L6 20 Z"
          fill={`url(#sm-${id})`} clipPath={`url(#cp-${id})`} />
      )}

      {tier >= 3 && (
        <path d="M32 9 L53 22 L53 42 L32 55 L11 42 L11 22 Z"
          fill="none" stroke={color} strokeWidth="0.4" opacity={tier >= 5 ? 0.3 : 0.15} />
      )}

      {tier <= 2 && (
        <path d="M24 36 L32 26 L40 36"
          fill="none" stroke={`url(#mg-${id})`}
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      )}

      {(tier === 3 || tier === 4) && (
        <g>
          <path d="M23 34 L32 24 L41 34"
            fill="none" stroke={`url(#mg-${id})`}
            strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M23 42 L32 32 L41 42"
            fill="none" stroke={`url(#mg-${id})`}
            strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"
            opacity="0.5" />
        </g>
      )}

      {(tier === 5 || tier === 6) && (
        <g>
          <path d="M22 30 L32 20 L42 30"
            fill="none" stroke={`url(#mg-${id})`}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M25 38 L32 31 L39 38"
            fill={color} fillOpacity="0.25"
            stroke={`url(#mg-${id})`}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M25 45 L32 38 L39 45"
            fill="none" stroke={`url(#mg-${id})`}
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            opacity="0.4" />
        </g>
      )}

      {tier === 7 && (
        <g>
          <path d="M14 34 Q10 30 14 24" fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" />
          <path d="M50 34 Q54 30 50 24" fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" />
          <path d="M22 34 L32 22 L42 34"
            fill={color} fillOpacity="0.15"
            stroke={`url(#mg-${id})`}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M32 36 L36 40 L32 44 L28 40 Z"
            fill={`url(#mg-${id})`} opacity="0.7" />
          {[{x:20,y:24,d:0},{x:44,y:24,d:0.6},{x:32,y:48,d:1.2}].map((s,i) => (
            <circle key={i} cx={s.x} cy={s.y} r="1" fill={accent} opacity="0">
              <animate attributeName="opacity" values="0;0.8;0" dur="2.5s" begin={`${s.d}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      )}

      {tier === 8 && (
        <g>
          <path d="M12 36 Q6 30 10 20 Q12 26 14 30" fill={color} fillOpacity="0.2"
            stroke={color} strokeWidth="0.8" opacity="0.6" />
          <path d="M52 36 Q58 30 54 20 Q52 26 50 30" fill={color} fillOpacity="0.2"
            stroke={color} strokeWidth="0.8" opacity="0.6" />
          <path d="M10 38 Q4 30 8 16" fill="none" stroke={accent} strokeWidth="0.5" opacity="0.3" />
          <path d="M54 38 Q60 30 56 16" fill="none" stroke={accent} strokeWidth="0.5" opacity="0.3" />
          <path d="M22 34 L32 20 L42 34 Z"
            fill={`url(#mg-${id})`} fillOpacity="0.2"
            stroke={`url(#mg-${id})`}
            strokeWidth="2" strokeLinejoin="round" />
          <path d="M32 30 L35 34 L32 38 L29 34 Z" fill={accent} opacity="0.9">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite" />
          </path>
          <path d="M26 44 L32 40 L38 44" fill="none" stroke={color} strokeWidth="1.2"
            strokeLinecap="round" opacity="0.5" />
          <line x1="18" y1="18" x2="22" y2="28" stroke={accent} strokeWidth="0.8" opacity="0">
            <animate attributeName="opacity" values="0;0.7;0" dur="3s" repeatCount="indefinite" />
          </line>
          <line x1="46" y1="18" x2="42" y2="28" stroke={accent} strokeWidth="0.8" opacity="0">
            <animate attributeName="opacity" values="0;0.7;0" dur="3s" begin="1.5s" repeatCount="indefinite" />
          </line>
        </g>
      )}

      {tier === 9 && (
        <g>
          <path d="M10 40 Q1 28 6 10 Q10 20 12 28" fill={color} fillOpacity="0.3"
            stroke={`url(#mg-${id})`} strokeWidth="1.2" opacity="0.8" />
          <path d="M54 40 Q63 28 58 10 Q54 20 52 28" fill={color} fillOpacity="0.3"
            stroke={`url(#mg-${id})`} strokeWidth="1.2" opacity="0.8" />
          <path d="M8 42 Q-2 26 4 6" fill="none" stroke={accent} strokeWidth="0.6" opacity="0.3" />
          <path d="M56 42 Q66 26 60 6" fill="none" stroke={accent} strokeWidth="0.6" opacity="0.3" />
          <path d="M12 36 Q6 28 9 16 Q12 24 14 30" fill={accent} fillOpacity="0.1" />
          <path d="M52 36 Q58 28 55 16 Q52 24 50 30" fill={accent} fillOpacity="0.1" />
          <path d="M22 14 L25 6 L28 11 L32 4 L36 11 L39 6 L42 14"
            fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="round" opacity="0.9">
            <animate attributeName="stroke" values={`${color};${accent};#FFFFFF;${accent};${color}`} dur="3s" repeatCount="indefinite" />
          </path>
          <circle cx="32" cy="6" r="1.5" fill="#FFFACD" opacity="1">
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="25" cy="8" r="1" fill={accent} opacity="0.8">
            <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.5s" begin="0.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="39" cy="8" r="1" fill={accent} opacity="0.8">
            <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.5s" begin="0.4s" repeatCount="indefinite" />
          </circle>
          <path d="M18 38 L32 18 L46 38 Z"
            fill={`url(#mg-${id})`} fillOpacity="0.3"
            stroke={`url(#mg-${id})`}
            strokeWidth="2" strokeLinejoin="round" />
          <path d="M32 26 L37 32 L32 38 L27 32 Z" fill={accent} opacity="0.95">
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1s" repeatCount="indefinite" />
          </path>
          <path d="M32 28 L34.5 32 L32 36 L29.5 32 Z" fill="#FFFACD" opacity="0.4">
            <animate attributeName="opacity" values="0.2;0.5;0.2" dur="1s" repeatCount="indefinite" />
          </path>
          <path d="M22 46 L26 43 L29 45 L32 42 L35 45 L38 43 L42 46"
            fill="none" stroke={`url(#mg-${id})`} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const x1 = 32 + Math.cos(rad) * 8;
            const y1 = 32 + Math.sin(rad) * 8;
            const x2 = 32 + Math.cos(rad) * 12;
            const y2 = 32 + Math.sin(rad) * 12;
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={accent} strokeWidth="0.5" opacity="0">
                <animate attributeName="opacity" values="0;0.4;0" dur="2s"
                  begin={`${i * 0.25}s`} repeatCount="indefinite" />
              </line>
            );
          })}
          {[
            {cx:24,cy:52,r:1.4,dur:1.6,delay:0},
            {cx:30,cy:54,r:1.1,dur:1.3,delay:0.2},
            {cx:34,cy:53,r:1.3,dur:1.5,delay:0.5},
            {cx:40,cy:52,r:1.2,dur:1.7,delay:0.8},
            {cx:20,cy:50,r:1.0,dur:1.4,delay:1.0},
            {cx:44,cy:50,r:1.1,dur:1.8,delay:0.4},
            {cx:28,cy:53,r:0.9,dur:1.6,delay:1.2},
            {cx:36,cy:54,r:1.0,dur:1.4,delay:0.7},
          ].map((p, i) => (
            <circle key={`fire-${i}`} cx={p.cx} cy={p.cy} r={p.r}
              fill={i % 3 === 0 ? "#FFD700" : i % 3 === 1 ? "#FFFACD" : "#FFA500"} opacity="0.9">
              <animate attributeName="cy" values={`${p.cy};${16 + i * 2}`}
                dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0"
                dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
              <animate attributeName="r" values={`${p.r};0`}
                dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      )}
    </svg>
  );
}

export default BadgeSVG;
