import * as THREE from 'three';

// ── conspace-rooms · boards.js ──────────────────────────────────────────────
// The hospital's notice boards, where the walls ask about fear: cork in a wooden frame, a typed sheet
//            with the question pinned in the middle, older notices around it,
//            pushpins, a strip of yellowed tape
// and the painted rugs and runners of grandmother's rooms. Every texture is
// drawn once on a canvas; nothing is downloaded.

const rnd = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function wrap(g, text, x, y, maxW, lh, align = 'left') {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  g.textAlign = align;
  lines.forEach((l, i) => g.fillText(l, x, y + i * lh));
  return lines.length;
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;             // raw sRGB values, written as is by the prop shader
}

// ── fear: the notice board ──────────────────────────────────────────────────
const NOTICES = {
  ru: ['ГРАФИК ПОСЕЩЕНИЙ', 'ПРОЦЕДУРНАЯ · 8:00', 'СОБЛЮДАЙТЕ ТИШИНУ', 'ФЛЮОРОГРАФИЯ · КАБ. 12', 'ПОСТ МЕДСЕСТРЫ'],
  en: ['VISITING HOURS', 'TREATMENT ROOM · 8:00', 'KEEP SILENCE', 'X-RAY · ROOM 12', 'NURSES’ STATION'],
};
// The frame and its cork: nine thousand crumbs, close to half of what a board
// costs to paint. Four corks are painted once, and every board takes one.
const BOARD_W = 822, BOARD_H = 600, CRUMBS = 9000, CORKS = [];
function cork(k) {
  if (CORKS[k]) return CORKS[k];
  const W = BOARD_W, H = BOARD_H, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rnd(k * 7919 + 13);
  g.fillStyle = '#5b4128'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,230,190,0.12)'; g.fillRect(0, 0, W, 6); g.fillRect(0, 0, 6, H);
  g.fillStyle = '#9c7446'; g.fillRect(26, 26, W - 52, H - 52);
  for (let i = 0; i < CRUMBS; i++) {                     // cork crumbs
    g.fillStyle = `rgba(${r() < 0.5 ? '70,44,20' : '190,150,100'},${0.15 + r() * 0.35})`;
    g.fillRect(26 + r() * (W - 52), 26 + r() * (H - 52), 1 + r() * 3, 1 + r() * 3);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(26, 26, W - 52, 8); g.fillRect(26, 26, 8, H - 52);   // the frame's shadow on the cork
  return (CORKS[k] = c);
}

export function boardTexture(text, seed, lang) {
  const W = BOARD_W, H = BOARD_H, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rnd(seed * 7919 + 13);
  g.drawImage(cork(Math.abs(seed) % 4), 0, 0);
  for (let i = 0; i < CRUMBS * 6; i++) r();              // the draws the crumbs took: every sheet and pin stays where it was
  const pin = (x, y) => {
    const col = ['#c0282d', '#2c5fa8', '#e0b030', '#2f8a4a'][Math.floor(r() * 4)];
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(x + 3, y + 4, 9, 0, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(x - 3, y - 3, 3, 0, 7); g.fill();
  };
  const sheet = (x, y, w, h, rot, fill, draw) => {
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(rot);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-w / 2 + 5, -h / 2 + 7, w, h);
    g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(120,100,60,${r() * 0.08})`; g.fillRect(-w / 2 + r() * w, -h / 2 + r() * h, 2, 2); }
    draw(-w / 2, -h / 2, w, h);
    g.restore();
  };
  // older notices round the edges
  const notes = NOTICES[lang] || NOTICES.en;
  const spots = [[48, 50, 190, 120], [W - 250, 44, 200, 140], [44, H - 190, 180, 150], [W - 230, H - 180, 185, 135]];
  spots.forEach(([x, y, w, h], i) => {
    sheet(x, y, w, h, (r() - 0.5) * 0.12, ['#e9e4d2', '#f1e7b8', '#dfe6e0', '#efe0d6'][i], (sx, sy, sw) => {
      g.fillStyle = '#2a2a2a'; g.font = 'bold 17px "Departure Mono", monospace';
      wrap(g, notes[(i + Math.floor(r() * 5)) % notes.length], sx + 14, sy + 30, sw - 28, 22);
      g.fillStyle = 'rgba(40,40,40,0.35)';
      for (let k = 0; k < 4; k++) g.fillRect(sx + 14, sy + 64 + k * 14, (sw - 28) * (0.5 + r() * 0.5), 5);   // lines of small print
    });
    pin(x + w / 2 + (r() - 0.5) * 20, y + 12);
  });
  // the question, typed on a fresh sheet in the middle
  const qw = 420, qh = 330, qx = (W - qw) / 2, qy = (H - qh) / 2 + 6;
  sheet(qx, qy, qw, qh, (r() - 0.5) * 0.05, '#f7f4ea', (sx, sy, sw, sh) => {
    g.fillStyle = '#1b1b1b'; g.font = '27px "Departure Mono", monospace';
    const n = wrap(g, text, sx + 30, sy + 64, sw - 60, 36);
    g.fillStyle = 'rgba(160,20,20,0.6)'; g.fillRect(sx + 30, sy + 64 + n * 36 - 10, 80, 3);   // underlined in red pencil
    g.fillStyle = 'rgba(30,30,30,0.5)'; g.font = '15px "Departure Mono", monospace';
    g.fillText('?', sx + sw - 40, sy + sh - 24);
  });
  pin(qx + 26, qy + 18); pin(qx + qw - 26, qy + 18);
  g.fillStyle = 'rgba(214,196,140,0.7)';                  // a strip of tape across a corner
  g.save(); g.translate(qx + qw - 30, qy + qh - 12); g.rotate(-0.6); g.fillRect(-40, -11, 80, 22); g.restore();
  return tex(c);
}

// ── memory: what the red rooms paint ─────────────────────────────────────────
// The wall carpets and most rugs are woven pictures now (carpets.js); painted
// here are the big rug under the television, in its lampshade's colours, and
// the runners. Painting one takes tens of milliseconds, and a chunk would
// paint new ones every time it is built mid-walk: there are a few of each,
// painted the first time they are wanted and shared after (a chunk's disposal
// only frees the GPU copy, three uploads it again when it is next drawn).
// A room's rug takes its lampshade's colours, so four patterns do for those.
const POOL = new Map();
const pooled = (key, make) => POOL.get(key) ?? POOL.set(key, make()).get(key);

// The runners, as jobs for whoever paints ahead: soulpath.js runs them one
// a frame once grandmother's stage begins, so the walk there seldom waits for
// a new one. (They used to wait for a long idle stretch of the browser, which
// never comes while the render loop runs.)
// the wool pile is thousands of single strokes, most of a rug's cost; the
// low tier (phones) draws a third of them, else each carpet stalls a phone
// for a third of a second, and in the portal's flight the tunnel froze on it
const pile = n => Math.round(n * (window.__app?.quality?.tier === 0 ? 0.3 : 1));

export function boardPaintJobs() {
  const jobs = [];
  for (let k = 0; k < 6; k++) jobs.push(() => runnerTexture(k));
  return jobs;
}

// ── memory: a rug on the parquet ────────────────────────────────────────────
// The big rug under grandmother's television, in her lampshade's colours: a deep field darkening to its border,
// wavy cream medallions, small motifs between, wool pile, fringe at the ends.
// pal: { field, dark, light } to take a lampshade's colours (kitchen.js SHADES)
// A woven runner (дорожка): lengthwise, burgundy with bands of green and
// beige across, thin light stripes at the edges, a little fringe, the weave
// in fine lines. Same canvas size as a rug, long side down the canvas.
export function runnerTexture(seed) { seed %= 6; return pooled('runnerTexture|' + seed, () => drawRunnerTexture(seed)); }
function drawRunnerTexture(seed) {
  const W = 216, H = 720, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rnd(seed * 911 + 7);
  g.fillStyle = '#6e1a1f'; g.fillRect(0, 0, W, H);
  for (const x of [10, W - 16]) { g.fillStyle = '#d8c7a4'; g.fillRect(x, 0, 6, H); g.fillStyle = '#2f5a3a'; g.fillRect(x + (x < W / 2 ? 10 : -10), 0, 5, H); }
  for (let y = 40; y < H - 40; y += 60 + Math.floor(r() * 30)) {
    const band = r() < 0.5 ? ['#2f5a3a', '#d8c7a4'] : ['#d8c7a4', '#2f5a3a'];
    g.fillStyle = band[0]; g.fillRect(24, y, W - 48, 10);
    g.fillStyle = band[1]; g.fillRect(24, y + 14, W - 48, 4);
  }
  g.globalAlpha = 0.12; g.fillStyle = '#000';
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);          // the weft
  g.globalAlpha = 1; g.fillStyle = '#e2d6bc';
  for (let x = 4; x < W; x += 6) { g.fillRect(x, 0, 2, 10); g.fillRect(x, H - 10, 2, 10); }   // fringe
  return tex(c);
}

export function rugTexture(seed, pal = null) { seed %= 4; return pooled('rugTexture|' + seed + '|' + (pal ? pal.field + pal.dark + pal.light : ''), () => drawRugTexture(seed, pal)); }
function drawRugTexture(seed, pal = null) {
  const W = 432, H = 720, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rnd(seed * 7727 + 3);
  const RED = pal?.field || '#5e0a0f', DARK = pal?.dark || '#1f0608', CREAM = pal?.light || '#c9b199';
  g.fillStyle = RED; g.fillRect(0, 0, W, H);
  const edge = g.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, H * 0.62);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = edge; g.fillRect(0, 0, W, H);
  g.strokeStyle = DARK; g.lineWidth = 16; g.strokeRect(14, 26, W - 28, H - 52);
  g.strokeStyle = CREAM; g.lineWidth = 2; g.strokeRect(26, 38, W - 52, H - 76);
  // medallions: two wavy rings each, as the old carpet had
  const ring = (cx, cy, rad, amp, k) => {
    g.beginPath();
    for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2, rr = rad + amp * Math.sin(a * k); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.stroke();
  };
  g.strokeStyle = CREAM; g.lineWidth = 3;
  for (const cy of [H * 0.3, H * 0.7]) { ring(W / 2, cy, 64, 9, 8); ring(W / 2, cy, 104, 6, 12); }
  // small motifs strewn in the field
  g.fillStyle = 'rgba(201,177,153,0.7)';
  for (let i = 0; i < 40; i++) {
    const x = 50 + r() * (W - 100), y = 60 + r() * (H - 120);
    if (Math.hypot(x - W / 2, Math.min(Math.abs(y - H * 0.3), Math.abs(y - H * 0.7))) < 115) continue;
    g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.fill();
  }
  // pile
  g.filter = 'blur(1.1px)'; g.drawImage(c, 0, 0); g.filter = 'none';
  const px = g.getImageData(0, 0, W, H).data;
  for (let i = 0, n = pile(26000); i < n; i++) {
    const x = r() * W, y = r() * H, k = (Math.floor(y) * W + Math.floor(x)) * 4, sh = r() < 0.5 ? 0.75 : 1.2;
    g.strokeStyle = `rgba(${Math.min(255, px[k] * sh) | 0},${Math.min(255, px[k + 1] * sh) | 0},${Math.min(255, px[k + 2] * sh) | 0},0.5)`;
    g.lineWidth = 1; const a = r() * 6.283, l = 1.5 + r() * 2.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // fringe at the short ends, on a transparent margin
  g.clearRect(0, 0, W, 14); g.clearRect(0, H - 14, W, 14);
  g.fillStyle = CREAM;
  for (let x = 16; x < W - 16; x += 6) { g.fillRect(x, 2 + r() * 4, 2, 14); g.fillRect(x, H - 16, 2, 12 + r() * 4); }
  return tex(c);
}

// Je suis le spectre d'une rose que tu portais hier au bal.
