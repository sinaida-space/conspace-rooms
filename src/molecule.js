// ── conspace-rooms · molecule.js ────────────────────────────────────────────
// Welcome-screen background: the skeletal formula of cortisol, the stress
// hormone, drawn as a constellation: every atom a star on a faint wire. Stars
// glow on and off in random order. Click one bulb, then another, and current runs
// between them along the bonds: an arc crawls from bulb to bulb, every bulb on
// the way flares, and the room hums like an old appliance switching on.
// Runs only while the welcome screen is visible.

// Cortisol, C21H30O5, as a 2D skeleton (bond length 1, y up). Ring A–C are
// hexagons, ring D a pentagon; substituents follow the usual drawing.
const ATOMS = {
  C1: [0, 1], C2: [-0.866, 0.5], C3: [-0.866, -0.5], C4: [0, -1], C5: [0.866, -0.5], C10: [0.866, 0.5],
  C6: [1.732, -1], C7: [2.598, -0.5], C8: [2.598, 0.5], C9: [1.732, 1],
  C11: [1.732, 2], C12: [2.598, 2.5], C13: [3.464, 2], C14: [3.464, 1],
  C15: [4.415, 0.691], C16: [5.003, 1.5], C17: [4.415, 2.309],
  C18: [3.464, 3], C19: [0.866, 1.5],
  C20: [5.281, 2.809], C21: [5.281, 3.809],
  O3: [-1.732, -1], O11: [0.866, 2.5], O17: [4.115, 3.263], O20: [6.147, 2.309], O21: [6.147, 4.309],
};
const BONDS = [
  ['C1', 'C2'], ['C2', 'C3'], ['C3', 'C4'], ['C4', 'C5', 2], ['C5', 'C10'], ['C10', 'C1'],
  ['C5', 'C6'], ['C6', 'C7'], ['C7', 'C8'], ['C8', 'C9'], ['C9', 'C10'],
  ['C9', 'C11'], ['C11', 'C12'], ['C12', 'C13'], ['C13', 'C14'], ['C14', 'C8'],
  ['C14', 'C15'], ['C15', 'C16'], ['C16', 'C17'], ['C17', 'C13'],
  ['C13', 'C18'], ['C10', 'C19'],
  ['C3', 'O3', 2], ['C11', 'O11'], ['C17', 'O17'], ['C17', 'C20'], ['C20', 'O20', 2], ['C20', 'C21'], ['C21', 'O21'],
];

const WIRE = 'rgba(63,138,90,0.16)';
const GREEN = [57, 255, 106];
const AMBER = [255, 176, 96];   // oxygen bulbs burn warmer

let running = false;

export function startMolecule(host) {
  if (running || !host) return;
  running = true;

  const canvas = document.createElement('canvas');
  canvas.id = 'molecule';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  const ctx = canvas.getContext('2d');

  const names = Object.keys(ATOMS);
  const bulbs = names.map(n => ({
    name: n, ox: n.startsWith('O'),
    x: 0, y: 0, level: 0, target: 0, until: 0, flare: 0,
  }));
  const byName = Object.fromEntries(bulbs.map(b => [b.name, b]));
  const adj = new Map(bulbs.map(b => [b, []]));
  for (const [a, b] of BONDS) { adj.get(byName[a]).push(byName[b]); adj.get(byName[b]).push(byName[a]); }

  let scale = 60, r = 9, selected = null, arcs = [], audio = null;

  function layout() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // molecule spans x −1.73…6.15, y −1…4.31; fit it large and centred
    scale = Math.min(innerWidth / 9.2, innerHeight / 6.6);
    r = Math.max(6, scale * 0.13);
    const cx = innerWidth / 2 - ((-1.732 + 6.147) / 2) * scale;
    const cy = innerHeight / 2 + ((-1 + 4.309) / 2) * scale;
    for (const b of bulbs) { const [x, y] = ATOMS[b.name]; b.x = cx + x * scale; b.y = cy - y * scale; }
  }

  // shortest path along bonds (breadth-first)
  function path(a, b) {
    const prev = new Map([[a, null]]), q = [a];
    while (q.length) {
      const n = q.shift();
      if (n === b) break;
      for (const m of adj.get(n)) if (!prev.has(m)) { prev.set(m, n); q.push(m); }
    }
    const out = [];
    for (let n = b; n; n = prev.get(n)) out.unshift(n);
    return out;
  }

  // ── sound: an old appliance coming to life, all synthesized ──
  function ensureAudio() {
    if (audio) return audio;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audio = new AC();
    return audio;
  }
  function click() { // glass filament "tink" when a bulb is armed
    const ac = ensureAudio(); if (!ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(2400, t); o.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.14);
  }
  function zap(duration) { // relay clack, mains hum swelling up, crackle of sparks
    const ac = ensureAudio(); if (!ac) return;
    const t = ac.currentTime, out = ac.createGain();
    out.gain.value = 0.9; out.connect(ac.destination);
    // relay
    const k = ac.createOscillator(), kg = ac.createGain();
    k.type = 'square'; k.frequency.value = 180;
    kg.gain.setValueAtTime(0.12, t); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    k.connect(kg); kg.connect(out); k.start(t); k.stop(t + 0.05);
    // 50 Hz hum with harmonics, like a transformer warming up
    const hum = ac.createOscillator(), lp = ac.createBiquadFilter(), hg = ac.createGain();
    hum.type = 'sawtooth'; hum.frequency.value = 50;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(200, t); lp.frequency.linearRampToValueAtTime(900, t + duration);
    hg.gain.setValueAtTime(0.0001, t);
    hg.gain.exponentialRampToValueAtTime(0.07, t + 0.15);
    hg.gain.setValueAtTime(0.07, t + duration);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.6);
    hum.connect(lp); lp.connect(hg); hg.connect(out); hum.start(t); hum.stop(t + duration + 0.7);
    // sparks: gated noise bursts
    const len = Math.floor(ac.sampleRate * (duration + 0.2));
    const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() < 0.02 ? (Math.random() * 2 - 1) : d[i - 1] * 0.7 || 0;
    const n = ac.createBufferSource(), bp = ac.createBiquadFilter(), ng = ac.createGain();
    n.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.8; ng.gain.value = 0.35;
    n.connect(bp); bp.connect(ng); ng.connect(out); n.start(t);
  }

  function onClick(e) {
    if (e.target.closest?.('button, a, input, label')) return; // real controls win
    const x = e.clientX, y = e.clientY;
    const hit = bulbs.find(b => Math.hypot(b.x - x, b.y - y) < Math.max(14, r * 1.8)); // stars are tiny; keep a generous hit area
    if (!hit) return;
    if (!selected || selected === hit) {
      selected = selected === hit ? null : hit;
      if (selected) { selected.target = 1; selected.until = performance.now() + 60000; click(); }
      return;
    }
    const route = path(selected, hit);
    const dur = 0.25 + route.length * 0.09;
    arcs.push({ route, t0: performance.now(), dur: dur * 1000 });
    zap(dur);
    selected.until = performance.now(); // the armed bulb lets go once current flows
    selected = null;
  }

  // random glow: every so often a bulb decides to light up for a while
  let nextFlip = 0;
  function tick(now) {
    if (!running) return;
    if (host.classList.contains('hidden')) { stop(); return; }
    if (now > nextFlip) {
      nextFlip = now + 180 + Math.random() * 420;
      const b = bulbs[Math.floor(Math.random() * bulbs.length)];
      if (b !== selected) { b.target = b.target ? 0 : 1; b.until = now + 900 + Math.random() * 2600; }
    }
    for (const b of bulbs) {
      if (b.target && now > b.until && b !== selected) b.target = 0;
      b.level += (b.target - b.level) * (b.target ? 0.12 : 0.05);
      b.flare *= 0.94;
    }
    draw(now);
    requestAnimationFrame(tick);
  }

  function draw(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    // wires
    ctx.lineWidth = 0.8; ctx.strokeStyle = WIRE;
    for (const [a, b, order] of BONDS) {
      const A = byName[a], B = byName[b];
      if (order === 2) { // double bond: two parallel wires
        const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy), ox = -dy / l * 2, oy = dx / l * 2;
        line(A.x + ox, A.y + oy, B.x + ox, B.y + oy); line(A.x - ox, A.y - oy, B.x - ox, B.y - oy);
      } else line(A.x, A.y, B.x, B.y);
    }
    // current running along a route: a jagged arc that crawls forward
    arcs = arcs.filter(arc => now - arc.t0 < arc.dur + 400);
    for (const arc of arcs) {
      const p = Math.min(1, (now - arc.t0) / arc.dur);
      const reach = p * (arc.route.length - 1);
      ctx.save();
      ctx.strokeStyle = 'rgba(210,255,225,0.95)'; ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgb(57,255,106)'; ctx.shadowBlur = 14;
      ctx.beginPath();
      for (let i = 0; i < arc.route.length - 1 && i < reach; i++) {
        const A = arc.route[i], B = arc.route[i + 1], f = Math.min(1, reach - i);
        const ex = A.x + (B.x - A.x) * f, ey = A.y + (B.y - A.y) * f;
        ctx.moveTo(A.x, A.y);
        for (let s = 1; s <= 5; s++) {
          const u = s / 5, jx = (Math.random() - 0.5) * 7, jy = (Math.random() - 0.5) * 7;
          ctx.lineTo(A.x + (ex - A.x) * u + (s < 5 ? jx : 0), A.y + (ey - A.y) * u + (s < 5 ? jy : 0));
        }
        if (f >= 1) { B.flare = 1; B.level = Math.max(B.level, 1); }
      }
      if (p >= 1 || now - arc.t0 < arc.dur) ctx.stroke();
      ctx.restore();
      if (p < 0.05) arc.route[0].flare = 1;
    }
    // bulbs as stars: a tiny dim point when dark; a bright core, soft glow
    // and a faint twinkle when lit; a thin four-point sparkle on a flare
    for (const b of bulbs) {
      const col = b.ox ? AMBER : GREEN;
      const tw = 0.85 + 0.15 * Math.sin(now / 260 + b.x * 0.7);        // twinkle
      const armed = b === selected ? 0.6 + 0.4 * Math.sin(now / 160) : 0;
      const lit = Math.min(1, Math.max(b.level * tw, armed) + b.flare);
      if (lit > 0.03) {
        const R = 2 + 10 * lit + 8 * b.flare;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, R);
        g.addColorStop(0, `rgba(${col},${0.7 * lit})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, 7); ctx.fill();
      }
      const core = 0.9 + 1.4 * lit;
      ctx.fillStyle = lit > 0.3 ? `rgba(245,255,248,${0.5 + 0.5 * lit})` : `rgba(${col},${0.35 + 0.5 * lit})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, core, 0, 7); ctx.fill();
      if (b.flare > 0.1 || armed) {
        const L = 6 + 16 * Math.max(b.flare, armed * 0.5);
        ctx.strokeStyle = `rgba(245,255,248,${0.5 * Math.max(b.flare, armed * 0.6)})`; ctx.lineWidth = 0.8;
        line(b.x - L, b.y, b.x + L, b.y); line(b.x, b.y - L, b.x, b.y + L);
      }
    }
  }
  function line(x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }

  function stop() {
    running = false;
    removeEventListener('resize', layout);
    host.removeEventListener('click', onClick);
    canvas.remove();
    audio?.close?.();
  }

  layout();
  addEventListener('resize', layout);
  host.addEventListener('click', onClick);
  requestAnimationFrame(tick);
}

// Je suis le spectre d'une rose que tu portais hier au bal.
