/**
 * AnimatedIcons — vanilla JS, zero dependencies, Web Animations API.
 * Ported from itshover.com.
 *
 * Why: the static left-sidebar icons felt flat. Each icon here has a
 * tailored hover animation (the trophy shakes + bursts confetti, the
 * magnifier nudges, the bell rings, etc.) which gives the sidebar more
 * personality without adding any animation library to the bundle.
 *
 * Usage (React): see <AnimatedIcon /> in src/components/AnimatedIcon.jsx,
 * which wraps create() and handles cleanup on unmount.
 */

function q(el, sel) { return el.querySelector(sel); }

function anim(el, frames, opts) {
  if (!el) return { finished: Promise.resolve(), cancel() {} };
  return el.animate(frames, { easing: 'ease-out', ...opts });
}

const ICONS = {
  home: {
    viewBox: '0 0 24 24',
    html: (c, sw) => `
      <g class="ih-roof" style="transform-origin:12px 5px;transform-box:fill-box">
        <path d="M3 9l9-7 9 7" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <g class="ih-house" style="transform-origin:12px 15px;transform-box:fill-box">
        <path d="M3 9v11a2 2 0 0 0 2 2h4v-6h6v6h4a2 2 0 0 0 2-2V9" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <g class="ih-door" style="transform-origin:12px 19px;transform-box:fill-box">
        <polyline points="9 22 9 16 15 16 15 22" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`,
    init(svg) {
      svg.addEventListener('mouseenter', () => {
        anim(q(svg,'.ih-roof'),  [{transform:'translateY(0)',opacity:1},{transform:'translateY(-2px)',opacity:0.7},{transform:'translateY(0)',opacity:1}], {duration:400});
        setTimeout(() => anim(q(svg,'.ih-house'), [{transform:'scale(1)'},{transform:'scale(1.04)'},{transform:'scale(1)'}], {duration:300}), 120);
        setTimeout(() => anim(q(svg,'.ih-door'),  [{transform:'scaleY(1)'},{transform:'scaleY(0.8)'},{transform:'scaleY(1)'}], {duration:300}), 240);
      });
    }
  },

  magnifier: {
    viewBox: '0 0 32 32',
    overflow: true,
    html: (c, sw) => `
      <g class="ih-mag" style="transform-origin:13px 13px;transform-box:fill-box">
        <path d="m21.393,18.565l7.021,7.021c.781.781.781,2.047,0,2.828h0c-.781.781-2.047.781-2.828,0l-7.021-7.021" fill="none" stroke="${c}" stroke-width="${sw}" stroke-miterlimit="10"/>
        <circle cx="13" cy="13" r="10" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="square"/>
      </g>`,
    init(svg) {
      svg.addEventListener('mouseenter', () => {
        anim(q(svg,'.ih-mag'), [
          {transform:'translate(0px,0px) rotate(0deg)'},
          {transform:'translate(1px,-1px) rotate(-5deg)'},
          {transform:'translate(0px,-2px) rotate(5deg)'},
          {transform:'translate(-1px,-1px) rotate(-5deg)'},
          {transform:'translate(0px,0px) rotate(0deg)'},
        ], {duration:1000, easing:'ease-in-out'});
      });
    }
  },

  communities: {
    viewBox: '0 0 24 24',
    html: (c, sw) => `
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <g class="ih-uc" style="transform-origin:12px 15px;transform-box:fill-box">
        <path d="M10 13a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 21v-1a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v1" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <g class="ih-ur" style="transform-origin:19px 7px;transform-box:fill-box">
        <path d="M15 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M17 10h2a2 2 0 0 1 2 2v1" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <g class="ih-ul" style="transform-origin:5px 7px;transform-box:fill-box">
        <path d="M5 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3 13v-1a2 2 0 0 1 2 -2h2" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`,
    init(svg) {
      svg.addEventListener('mouseenter', () => {
        anim(q(svg,'.ih-uc'), [{transform:'translate(0,0) scale(1)'},{transform:'translate(0,-2px) scale(1.05)'},{transform:'translate(0,0) scale(1)'}], {duration:350});
        setTimeout(() => anim(q(svg,'.ih-ul'), [{transform:'translate(0,0) scale(1)'},{transform:'translate(-1px,0) scale(1.02)'},{transform:'translate(0,0) scale(1)'}], {duration:300}), 60);
        setTimeout(() => anim(q(svg,'.ih-ur'), [{transform:'translate(0,0) scale(1)'},{transform:'translate(1px,0) scale(1.02)'},{transform:'translate(0,0) scale(1)'}], {duration:300}), 60);
      });
    }
  },

  questions: {
    viewBox: '0 0 24 24',
    html: (c, sw) => `
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <g class="ih-qg" style="transform-origin:12px 12px;transform-box:fill-box">
        <path class="ih-qm" d="M8 8a3.5 3 0 0 1 3.5 -3h1a3.5 3 0 0 1 3.5 3a3 3 0 0 1 -2 3a3 4 0 0 0 -2 4" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <path class="ih-qd" d="M12 19l0 .01" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="transform-origin:12px 19px;transform-box:fill-box"/>
      </g>`,
    init(svg) {
      const qm = q(svg, '.ih-qm');
      const qd = q(svg, '.ih-qd');
      const qg = q(svg, '.ih-qg');
      svg.addEventListener('mouseenter', () => {
        const len = qm.getTotalLength ? qm.getTotalLength() : 50;
        qm.style.strokeDasharray = len;
        anim(qm, [{strokeDashoffset:len, opacity:0.4},{strokeDashoffset:0, opacity:1}], {duration:400, easing:'ease-in-out', fill:'forwards'});
        setTimeout(() => anim(qd, [{transform:'translateY(0)'},{transform:'translateY(-3px)'},{transform:'translateY(0)'}], {duration:300}), 420);
        setTimeout(() => anim(qg, [{transform:'scale(1)'},{transform:'scale(1.05)'},{transform:'scale(1)'}], {duration:200}), 700);
      });
      svg.addEventListener('mouseleave', () => {
        qm.style.strokeDasharray = '';
        qm.style.strokeDashoffset = '';
        qm.style.opacity = '';
      });
    }
  },

  arena: {
    viewBox: '0 0 24 24',
    html: (c, sw) => `
      <line class="ih-s1l" x1="3"  y1="5"  x2="10" y2="5"  stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>
      <line class="ih-s1"  x1="14" y1="3"  x2="14" y2="7"  stroke="${c}" stroke-width="${sw}" stroke-linecap="round" style="transform-origin:14px 5px;transform-box:fill-box"/>
      <line class="ih-s1r" x1="14" y1="5"  x2="21" y2="5"  stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>
      <line class="ih-s2l" x1="3"  y1="12" x2="8"  y2="12" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>
      <line class="ih-s2"  x1="8"  y1="10" x2="8"  y2="14" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" style="transform-origin:8px 12px;transform-box:fill-box"/>
      <line class="ih-s2r" x1="12" y1="12" x2="21" y2="12" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>
      <line class="ih-s3l" x1="3"  y1="19" x2="12" y2="19" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>
      <line class="ih-s3"  x1="16" y1="17" x2="16" y2="21" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" style="transform-origin:16px 19px;transform-box:fill-box"/>
      <line class="ih-s3r" x1="16" y1="19" x2="21" y2="19" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`,
    init(svg) {
      let anims = [];
      svg.addEventListener('mouseenter', () => {
        anims.push(q(svg,'.ih-s1').animate([{transform:'translateX(0)'},{transform:'translateX(-4px)'},{transform:'translateX(0)'}], {duration:2000,iterations:Infinity,easing:'ease-in-out'}));
        anims.push(q(svg,'.ih-s2').animate([{transform:'translateX(0)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],  {duration:2000,iterations:Infinity,easing:'ease-in-out',delay:200}));
        anims.push(q(svg,'.ih-s3').animate([{transform:'translateX(0)'},{transform:'translateX(-4px)'},{transform:'translateX(0)'}], {duration:2000,iterations:Infinity,easing:'ease-in-out',delay:400}));
      });
      svg.addEventListener('mouseleave', () => {
        anims.forEach(a => a.cancel());
        anims = [];
      });
    }
  },

  builderrank: {
    viewBox: '0 0 24 24',
    overflow: true,
    html: (c, sw) => `
      <g class="ih-tg" style="transform-origin:12px 20px;transform-box:fill-box">
        <path d="M6 9H4.5a1 1 0 0 1 0-5H6" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M18 9h1.5a1 1 0 0 0 0-5H18" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4 22h16" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <rect class="ih-c1" x="11" y="6" width="2" height="2" rx="0.5" fill="#FFD700" stroke="none" opacity="0" style="transform-origin:12px 7px;transform-box:fill-box"/>
        <rect class="ih-c2" x="12" y="5" width="2" height="2" rx="0.5" fill="#FF4500" stroke="none" opacity="0" style="transform-origin:13px 6px;transform-box:fill-box"/>
        <rect class="ih-c3" x="13" y="6" width="2" height="2" rx="0.5" fill="#00BFFF" stroke="none" opacity="0" style="transform-origin:14px 7px;transform-box:fill-box"/>
        <rect class="ih-c4" x="12" y="7" width="2" height="2" rx="0.5" fill="#32CD32" stroke="none" opacity="0" style="transform-origin:13px 8px;transform-box:fill-box"/>
      </g>`,
    init(svg) {
      const tg = q(svg,'.ih-tg');
      const confetti = [
        { el: q(svg,'.ih-c1'), x:'-12px', y:'-15px', r:'140deg' },
        { el: q(svg,'.ih-c2'), x:'-5px',  y:'-18px', r:'-100deg' },
        { el: q(svg,'.ih-c3'), x:'5px',   y:'-18px', r:'120deg' },
        { el: q(svg,'.ih-c4'), x:'12px',  y:'-15px', r:'-140deg' },
      ];
      svg.addEventListener('mouseenter', () => {
        anim(tg, [
          {transform:'translateY(0) rotate(0deg)'},
          {transform:'translateY(-4px) rotate(-10deg)'},
          {transform:'translateY(-4px) rotate(10deg)'},
          {transform:'translateY(0) rotate(0deg)'},
        ], {duration:800, easing:'ease-out'});
        confetti.forEach(({el, x, y, r}) => {
          setTimeout(() => anim(el, [
            {transform:'translate(0,0) rotate(0deg) scale(0)', opacity:0},
            {transform:`translate(${x},${y}) rotate(${r}) scale(1)`, opacity:1},
            {transform:`translate(${x},${y}) rotate(${r}) scale(0.5)`, opacity:0},
          ], {duration:800}), 100);
        });
      });
      svg.addEventListener('mouseleave', () => {
        anim(tg, [{transform:'translateY(0) rotate(0deg)'}], {duration:300});
        confetti.forEach(({el}) => el.animate([{opacity:0, transform:'scale(0)'}], {duration:200, fill:'forwards'}));
      });
    }
  },

  messages: {
    viewBox: '0 0 24 24',
    overflow: true,
    html: (c, sw) => `
      <g class="ih-send" style="transform-origin:12px 12px;transform-box:fill-box">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M10 14l11 -11" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`,
    init(svg) {
      const g = q(svg, '.ih-send');
      let busy = false;
      svg.addEventListener('mouseenter', async () => {
        if (busy) return;
        busy = true;
        await g.animate([
          {transform:'translate(0px,0px)', opacity:1},
          {transform:'translate(24px,-24px)', opacity:0},
        ], {duration:250, easing:'ease-in', fill:'forwards'}).finished;
        g.style.transform = 'translate(-24px,24px)';
        g.style.opacity = '0';
        await g.animate([
          {transform:'translate(-24px,24px)', opacity:0},
          {transform:'translate(0px,0px)', opacity:1},
        ], {duration:250, easing:'ease-out', fill:'forwards'}).finished;
        g.style.transform = '';
        g.style.opacity = '';
        busy = false;
      });
    }
  },

  savedposts: {
    viewBox: '0 0 24 24',
    html: (c, sw) => `
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path class="ih-sf" d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z"
        fill="${c}" stroke="none" opacity="0" style="transform-origin:12px 12px;transform-box:fill-box"/>
      <path class="ih-so" d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z"
        fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="transform-origin:12px 12px;transform-box:fill-box"/>`,
    init(svg) {
      const fill    = q(svg, '.ih-sf');
      const outline = q(svg, '.ih-so');
      svg.addEventListener('mouseenter', () => {
        fill.animate([{opacity:0,transform:'scale(0.8)'},{opacity:1,transform:'scale(1)'}], {duration:400, fill:'forwards'});
        anim(outline, [{transform:'scale(1) rotate(0deg)'},{transform:'scale(1.1) rotate(-5deg)'},{transform:'scale(1) rotate(5deg)'},{transform:'scale(1) rotate(0deg)'}], {duration:500, easing:'ease-in-out'});
      });
      svg.addEventListener('mouseleave', () => {
        fill.animate([{opacity:0}], {duration:300, fill:'forwards'});
        anim(outline, [{transform:'scale(1) rotate(0deg)'}], {duration:300});
      });
    }
  },

  profile: {
    viewBox: '0 0 24 24',
    html: (c, sw) => `
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <g class="ih-user" style="transform-origin:12px 12px;transform-box:fill-box">
        <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`,
    init(svg) {
      svg.addEventListener('mouseenter', () => {
        anim(q(svg,'.ih-user'), [{transform:'translate(0,0) scale(1)'},{transform:'translate(0,-1px) scale(1.05)'},{transform:'translate(0,0) scale(1)'}], {duration:300});
      });
    }
  },

  bell: {
    viewBox: '0 0 24 24',
    html: (c) => `
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path class="ih-bclap" d="M14.235 19c.865 0 1.322 1.024 .745 1.668a3.992 3.992 0 0 1 -2.98 1.332a3.992 3.992 0 0 1 -2.98 -1.332c-.552 -.616 -.158 -1.579 .634 -1.661l.11 -.006h4.471z"
        fill="${c}" stroke="none" style="transform-origin:12px 19px;transform-box:fill-box"/>
      <path class="ih-bbody" d="M12 2c1.358 0 2.506 .903 2.875 2.141l.046 .171l.008 .043a8.013 8.013 0 0 1 4.024 6.069l.028 .287l.019 .289v2.931l.021 .136a3 3 0 0 0 1.143 1.847l.167 .117l.162 .099c.86 .487 .56 1.766 -.377 1.864l-.116 .006h-16c-1.028 0 -1.387 -1.364 -.493 -1.87a3 3 0 0 0 1.472 -2.063l.021 -.143l.001 -2.97a8 8 0 0 1 3.821 -6.454l.248 -.146l.01 -.043a3.003 3.003 0 0 1 2.562 -2.29l.182 -.017l.176 -.004z"
        fill="${c}" stroke="none" style="transform-origin:12px 2px;transform-box:fill-box"/>`,
    init(svg) {
      svg.addEventListener('mouseenter', () => {
        anim(q(svg,'.ih-bbody'), [
          {transform:'rotate(0deg)'},{transform:'rotate(-8deg)'},{transform:'rotate(6deg)'},
          {transform:'rotate(-4deg)'},{transform:'rotate(2deg)'},{transform:'rotate(0deg)'},
        ], {duration:600, easing:'ease-in-out'});
        setTimeout(() => anim(q(svg,'.ih-bclap'), [
          {transform:'rotate(0deg)'},{transform:'rotate(20deg)'},{transform:'rotate(-18deg)'},
          {transform:'rotate(12deg)'},{transform:'rotate(-6deg)'},{transform:'rotate(0deg)'},
        ], {duration:600, easing:'ease-in-out'}), 50);
      });
    }
  },

  messagecircle: {
    viewBox: '0 0 24 24',
    overflow: true,
    html: (c, sw) => `
      <path class="ih-mc" d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"
        fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"
        style="transform-origin:12px 12px;transform-box:fill-box"/>`,
    init(svg) {
      const path = q(svg, '.ih-mc');
      svg.addEventListener('mouseenter', async () => {
        const len = path.getTotalLength ? path.getTotalLength() : 80;
        path.style.strokeDasharray = len;
        await path.animate([
          {strokeDashoffset:len, opacity:0.3},
          {strokeDashoffset:0,   opacity:1},
        ], {duration:600, easing:'ease-in-out', fill:'forwards'}).finished;
        anim(path, [{transform:'scale(1)'},{transform:'scale(1.05)'},{transform:'scale(1)'}], {duration:300});
      });
      svg.addEventListener('mouseleave', () => {
        path.style.strokeDasharray = '';
        path.style.strokeDashoffset = '';
        path.style.opacity = '';
      });
    }
  },

  // Terminal icon (itshover terminal-icon style) — used on the Create button.
  // Animation: on hover the chevron `>` redraws itself (stroke-dashoffset)
  // and the cursor underscore blinks twice. Reads as "open a prompt / write
  // something new", which suits the Create action.
  terminal: {
    viewBox: '0 0 24 24',
    html: (c, sw) => `
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2"
        fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>
      <polyline class="ih-term-chev" points="6 9 10 12 6 15"
        fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
      <line class="ih-term-cursor" x1="12" y1="16" x2="17" y2="16"
        stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`,
    init(svg) {
      const chev = q(svg, '.ih-term-chev');
      const cursor = q(svg, '.ih-term-cursor');
      svg.addEventListener('mouseenter', async () => {
        const len = chev.getTotalLength ? chev.getTotalLength() : 16;
        chev.style.strokeDasharray = len;
        await chev.animate(
          [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
          { duration: 320, easing: 'ease-out', fill: 'forwards' }
        ).finished;
        anim(cursor, [
          { opacity: 1 }, { opacity: 0 }, { opacity: 1 },
          { opacity: 0 }, { opacity: 1 },
        ], { duration: 600, easing: 'steps(5, end)' });
      });
      svg.addEventListener('mouseleave', () => {
        chev.style.strokeDasharray = '';
        chev.style.strokeDashoffset = '';
        cursor.style.opacity = '';
      });
    }
  },

  // Plus / Create icon — used on the sidebar Create button.
  // Animation: the whole plus rotates a quarter turn while scaling up briefly,
  // suggesting "open / spawn something new". Matches the visual energy of the
  // rest of the kit while staying readable as a plus sign at rest.
  plus: {
    viewBox: '0 0 24 24',
    html: (c, sw) => `
      <g class="ih-plus" style="transform-origin:12px 12px;transform-box:fill-box">
        <line x1="12" y1="5" x2="12" y2="19" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>
        <line x1="5" y1="12" x2="19" y2="12" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>
      </g>`,
    init(svg) {
      svg.addEventListener('mouseenter', () => {
        anim(q(svg, '.ih-plus'), [
          { transform: 'rotate(0deg) scale(1)' },
          { transform: 'rotate(45deg) scale(1.15)' },
          { transform: 'rotate(90deg) scale(1)' },
        ], { duration: 420, easing: 'cubic-bezier(.4,1.6,.6,1)', fill: 'forwards' });
      });
      svg.addEventListener('mouseleave', () => {
        anim(q(svg, '.ih-plus'), [
          { transform: 'rotate(90deg) scale(1)' },
          { transform: 'rotate(0deg) scale(1)' },
        ], { duration: 260, easing: 'ease-out', fill: 'forwards' });
      });
    }
  },

  spotlight: {
    viewBox: '0 0 24 24',
    html: (c) => `
      <g class="ih-gem" style="transform-origin:12px 12px;transform-box:fill-box">
        <path fill="${c}" d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"/>
      </g>`,
    init(svg) {
      svg.addEventListener('mouseenter', () => {
        anim(q(svg, '.ih-gem'), [
          { transform: 'scale(1) rotate(0deg)' },
          { transform: 'scale(0.9) rotate(180deg)' },
        ], { duration: 800, easing: 'ease-in-out', fill: 'forwards' });
      });
      svg.addEventListener('mouseleave', () => {
        anim(q(svg, '.ih-gem'), [
          { transform: 'scale(0.9) rotate(180deg)' },
          { transform: 'scale(1) rotate(360deg)' },
        ], { duration: 800, easing: 'ease-in-out', fill: 'forwards' });
      });
    }
  },

  videos: {
    viewBox: '0 0 24 24',
    html: (c, sw) => `
      <g class="ih-vid-box" style="transform-origin:12px 12px;transform-box:fill-box">
        <rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>
        <polygon class="ih-vid-play" points="10,9 16,12 10,15" fill="${c}" style="transform-origin:12px 12px;transform-box:fill-box"/>
      </g>`,
    init(svg) {
      let running = [];
      const stopAll = () => { running.forEach(a => a && a.cancel && a.cancel()); running = []; };
      svg.addEventListener('mouseenter', () => {
        stopAll();
        running.push(anim(q(svg, '.ih-vid-box'),
          [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }],
          { duration: 200, easing: 'ease-out', fill: 'forwards' }));
        running.push(anim(q(svg, '.ih-vid-play'),
          [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
          { duration: 700, iterations: Infinity, easing: 'ease-in-out' }));
      });
      svg.addEventListener('mouseleave', () => {
        stopAll();
        anim(q(svg, '.ih-vid-box'), [{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 200, fill: 'forwards' });
        const reset = (el) => { if (el) { el.style.transform = 'none'; } };
        reset(q(svg, '.ih-vid-play'));
      });
    }
  },

  gamepad: {
    viewBox: '0 0 24 24',
    overflow: true,
    html: (c, sw) => `
      <g class="ih-gp-body" style="transform-origin:12px 12px;transform-box:fill-box">
        <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <g class="ih-gp-dpad" style="transform-origin:8px 11px;transform-box:fill-box">
          <line x1="6" x2="10" y1="11" y2="11" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>
          <line x1="8" x2="8" y1="9" y2="13" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>
        </g>
        <line class="ih-gp-dot1" x1="15" x2="15.01" y1="12" y2="12" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" style="transform-origin:15px 12px;transform-box:fill-box"/>
        <line class="ih-gp-dot2" x1="18" x2="18.01" y1="10" y2="10" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" style="transform-origin:18px 10px;transform-box:fill-box"/>
      </g>`,
    init(svg) {
      let running = [];
      const stopAll = () => { running.forEach(a => a && a.cancel && a.cancel()); running = []; };
      svg.addEventListener('mouseenter', () => {
        stopAll();
        running.push(anim(q(svg, '.ih-gp-body'),
          [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }],
          { duration: 200, easing: 'ease-out', fill: 'forwards' }));
        running.push(anim(q(svg, '.ih-gp-dpad'),
          [
            { transform: 'translate(0,0)' },
            { transform: 'translate(-0.5px,0.5px)' },
            { transform: 'translate(0.5px,-0.5px)' },
            { transform: 'translate(-0.5px,0.5px)' },
            { transform: 'translate(0,0)' },
          ],
          { duration: 400, iterations: Infinity, easing: 'linear' }));
        running.push(anim(q(svg, '.ih-gp-dot1'),
          [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.4, transform: 'scale(1.2)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 600, iterations: Infinity, easing: 'ease-in-out' }));
        running.push(anim(q(svg, '.ih-gp-dot2'),
          [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.4, transform: 'scale(1.2)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 600, iterations: Infinity, easing: 'ease-in-out', delay: 300 }));
      });
      svg.addEventListener('mouseleave', () => {
        stopAll();
        anim(q(svg, '.ih-gp-body'), [{ transform: 'scale(1.05)' }, { transform: 'scale(1)' }], { duration: 200, fill: 'forwards' });
        const reset = (el) => { if (el) { el.style.opacity = '1'; el.style.transform = 'none'; } };
        reset(q(svg, '.ih-gp-dpad'));
        reset(q(svg, '.ih-gp-dot1'));
        reset(q(svg, '.ih-gp-dot2'));
      });
    }
  },
};

/**
 * Create an animated icon SVG and return the element. The caller is
 * responsible for inserting it into the DOM. If the icon mounts inside a
 * sidebar/nav button, hovering the whole button forwards the mouseenter to
 * the SVG so the animation fires from the entire row, not just the glyph.
 */
export function createAnimatedIcon(name, { size = 24, color = 'currentColor', strokeWidth = 2 } = {}) {
  const icon = ICONS[name];
  if (!icon) {
    console.warn(`AnimatedIcons: unknown icon "${name}". Available: ${Object.keys(ICONS).join(', ')}`);
    return null;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', icon.viewBox);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.style.cssText = `display:block;${icon.overflow ? 'overflow:visible;' : ''}`;
  svg.innerHTML = icon.html(color, strokeWidth);
  icon.init(svg);
  return svg;
}

export const availableIcons = Object.keys(ICONS);
