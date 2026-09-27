import * as THREE from 'three';

// ── conspace-rooms · boards.js ──────────────────────────────────────────────
// Where the walls ask their questions, a different thing in every stage:
//   FEAR     a hospital notice board: cork in a wooden frame, a typed sheet
//            with the question pinned in the middle, older notices around it,
//            pushpins, a strip of yellowed tape
//   MEMORY   a museum piece: a gilt frame, a cream mount, the question set in
//            a serif like a caption to a picture that is not there
// and the Soviet wall carpets of grandmother's rooms. Every texture is drawn
// once on a canvas; nothing is downloaded.

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
export function boardTexture(text, seed, lang) {
  const W = 822, H = 600, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rnd(seed * 7919 + 13);
  // the frame, then cork
  g.fillStyle = '#5b4128'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,230,190,0.12)'; g.fillRect(0, 0, W, 6); g.fillRect(0, 0, 6, H);
  g.fillStyle = '#9c7446'; g.fillRect(26, 26, W - 52, H - 52);
  for (let i = 0; i < 9000; i++) {                       // cork crumbs
    g.fillStyle = `rgba(${r() < 0.5 ? '70,44,20' : '190,150,100'},${0.15 + r() * 0.35})`;
    g.fillRect(26 + r() * (W - 52), 26 + r() * (H - 52), 1 + r() * 3, 1 + r() * 3);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(26, 26, W - 52, 8); g.fillRect(26, 26, 8, H - 52);   // the frame's shadow on the cork
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

// ── memory: the museum frame ────────────────────────────────────────────────
export function museumTexture(text, n) {
  const W = 480, H = 640, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // gilt frame: a dark outer step, a bright moulding, an inner bead
  const gold = g.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, '#f1d488'); gold.addColorStop(0.35, '#a8792f'); gold.addColorStop(0.6, '#e2bd6a'); gold.addColorStop(1, '#6e4a18');
  g.fillStyle = '#3d2a10'; g.fillRect(0, 0, W, H);
  g.fillStyle = gold; g.fillRect(8, 8, W - 16, H - 16);
  for (let k = 0; k < 6; k++) {                           // mouldings
    g.strokeStyle = k % 2 ? 'rgba(60,35,5,0.45)' : 'rgba(255,240,190,0.45)'; g.lineWidth = 3;
    g.strokeRect(14 + k * 7, 14 + k * 7, W - 28 - k * 14, H - 28 - k * 14);
  }
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(60,35,5,${Math.random() * 0.18})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }   // worn gilt
  // the mount, and the question where a picture would be
  const m = 64;
  g.fillStyle = '#efe7d3'; g.fillRect(m, m, W - 2 * m, H - 2 * m);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(m, m, W - 2 * m, 6); g.fillRect(m, m, 6, H - 2 * m);
  g.strokeStyle = 'rgba(140,110,60,0.5)'; g.lineWidth = 1.5; g.strokeRect(m + 26, m + 26, W - 2 * m - 52, H - 2 * m - 52);
  g.fillStyle = '#2b2118'; g.font = 'italic 30px Georgia, "Times New Roman", serif';
  let lines = 1, line = '';                               // count the lines first, to centre them
  for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > W - 2 * m - 90 && line) { lines++; line = w; } else line = t; }
  wrap(g, text, W / 2, H / 2 - (lines - 1) * 20, W - 2 * m - 90, 40, 'center');
  g.font = '15px Georgia, serif'; g.fillStyle = 'rgba(60,45,30,0.7)';
  g.fillText(`№ ${n}`, W / 2, H - m - 44);
  const fade = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.7);   // age at the edges of the mount
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(90,60,20,0.18)');
  g.fillStyle = fade; g.fillRect(m, m, W - 2 * m, H - 2 * m);
  return tex(c);
}

// ── memory: a Soviet wall carpet ────────────────────────────────────────────
// Burgundy field, a big central medallion, borders of small repeats, cream
// and indigo and black, a fringe along the short sides, the pile worn paler
// where hands and shoulders brushed it.
export function carpetTexture(seed) {
  const W = 512, H = 720, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rnd(seed * 104729 + 7);
  const field = ['#7a1418', '#6a1016', '#8a2a1a'][Math.floor(r() * 3)], cream = '#e6d3b0', ink = '#1c1a2a', blue = '#2c3f6e', gold = '#c89a44';
  g.fillStyle = field; g.fillRect(0, 0, W, H);
  // borders: three bands of small repeats
  const band = (k, col, step, shape) => {
    g.fillStyle = col;
    for (let x = k; x < W - k; x += step) { shape(x, k); shape(x, H - k - step); }
    for (let y = k; y < H - k; y += step) { shape(k, y); shape(W - k - step, y); }
  };
  g.fillStyle = ink; g.fillRect(18, 18, W - 36, H - 36);
  g.fillStyle = field; g.fillRect(52, 52, W - 104, H - 104);
  band(22, cream, 26, (x, y) => { g.beginPath(); g.moveTo(x + 13, y + 2); g.lineTo(x + 24, y + 13); g.lineTo(x + 13, y + 24); g.lineTo(x + 2, y + 13); g.fill(); });
  g.strokeStyle = gold; g.lineWidth = 3; g.strokeRect(58, 58, W - 116, H - 116);
  g.fillStyle = blue; g.fillRect(66, 66, W - 132, H - 132);
  g.fillStyle = field; g.fillRect(84, 84, W - 168, H - 168);
  band(68, cream, 18, (x, y) => g.fillRect(x + 6, y + 6, 6, 6));
  // the medallion: layered stepped diamonds
  const cx = W / 2, cy = H / 2;
  const diamond = (rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy - ry); g.lineTo(cx + rx, cy); g.lineTo(cx, cy + ry); g.lineTo(cx - rx, cy); g.closePath(); g.fill(); };
  [[170, 250, ink], [150, 225, cream], [132, 200, blue], [110, 170, field], [86, 136, gold], [64, 104, ink], [44, 72, cream], [22, 38, field]]
    .forEach(([rx, ry, col]) => diamond(rx, ry, col));
  // corner pieces and scattered small motifs in the field
  for (const [x, y] of [[110, 110], [W - 110, 110], [110, H - 110], [W - 110, H - 110]]) {
    g.fillStyle = cream; g.beginPath(); g.moveTo(x, y - 26); g.lineTo(x + 26, y); g.lineTo(x, y + 26); g.lineTo(x - 26, y); g.fill();
    g.fillStyle = blue; g.fillRect(x - 7, y - 7, 14, 14);
  }
  for (let i = 0; i < 26; i++) {
    const x = 100 + r() * (W - 200), y = 100 + r() * (H - 200);
    if (Math.abs(x - cx) / 180 + Math.abs(y - cy) / 260 < 1) continue;
    g.fillStyle = [cream, gold, blue][i % 3]; g.fillRect(x - 5, y - 5, 10, 10);
  }
  // pile: the pattern goes soft, as wool does, then thousands of short
  // fibres, each in the colour under it, a shade lighter or darker, leaning
  // every which way; the knots show as a faint grid
  g.filter = 'blur(1.6px)'; g.drawImage(c, 0, 0); g.filter = 'none';
  const px = g.getImageData(0, 0, W, H).data;
  g.lineCap = 'round';
  for (let i = 0; i < 42000; i++) {
    const x = r() * W, y = r() * H, k = (Math.floor(y) * W + Math.floor(x)) * 4;
    const sh = r() < 0.5 ? 0.72 + r() * 0.2 : 1.1 + r() * 0.25;
    g.strokeStyle = `rgba(${Math.min(255, px[k] * sh) | 0},${Math.min(255, px[k + 1] * sh) | 0},${Math.min(255, px[k + 2] * sh) | 0},0.55)`;
    g.lineWidth = 0.8 + r() * 0.9;
    const a2 = r() * 6.283, l = 1.5 + r() * 3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a2) * l, y + Math.sin(a2) * l); g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  const wear = g.createRadialGradient(W * (0.3 + r() * 0.4), H * 0.62, 10, W * 0.5, H * 0.62, W * 0.5);
  wear.addColorStop(0, 'rgba(255,230,200,0.14)'); wear.addColorStop(1, 'rgba(255,230,200,0)');
  g.fillStyle = wear; g.fillRect(0, 0, W, H);
  // fringe on the short sides
  g.fillStyle = cream;
  for (let x = 6; x < W - 6; x += 7) { g.fillRect(x, 0, 3, 14 + r() * 5); g.fillRect(x, H - 14 - r() * 5, 3, 20); }
  return tex(c);
}

// Je suis le spectre d'une rose que tu portais hier au bal.
