import * as THREE from 'three';

// ── conspace-rooms · boards.js ──────────────────────────────────────────────
// The hospital's notice boards, where the walls ask about fear: cork in a wooden frame, a typed sheet
//            with the question pinned in the middle, older notices around it,
//            pushpins, a strip of yellowed tape
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

// ── memory: a Soviet wall carpet ────────────────────────────────────────────
// The Persian pattern every Soviet flat hung over the sofa: a rust-red field,
// a lobed medallion in navy, black and cream with a gilt contour, lobed
// corner pieces, flowers strewn thick everywhere, a dark main border of
// rosettes on a winding vine between thin guard stripes. Drawn in one
// quarter and mirrored, as a weaver's cartoon would be; then the pile goes
// soft and fibrous over all of it. Landscape, as it hung.
export function carpetTexture(seed) {
  const W = 768, H = 560, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rnd(seed * 104729 + 7);
  const RED = ['#a3301c', '#9a2a1d', '#b03a22'][Math.floor(r() * 3)], NAVY = '#1b2238', BLACK = '#17110f',
    CREAM = '#f0e2c4', GOLD = '#d6a24c', BLUE = '#5d7fb0', ROSE = '#c24a3a', WINE = '#5e1a1c';
  const cx = W / 2, cy = H / 2;
  // mirror a drawing into all four quarters
  const quad = draw => { for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { g.save(); g.translate(cx, cy); g.scale(sx, sy); draw(); g.restore(); } };
  const rosette = (x, y, rad, petal, core, n = 8) => {
    g.fillStyle = petal;
    for (let k = 0; k < n; k++) { const a = k / n * 6.283; g.beginPath(); g.ellipse(x + Math.cos(a) * rad * 0.55, y + Math.sin(a) * rad * 0.55, rad * 0.45, rad * 0.22, a, 0, 6.283); g.fill(); }
    g.fillStyle = core; g.beginPath(); g.arc(x, y, rad * 0.28, 0, 6.283); g.fill();
  };
  const leaf = (x, y, len, ang, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, len, len * 0.32, ang, 0, 6.283); g.fill(); };
  const lobed = (rx, ry, lobes, depth, spike) => {    // a medallion outline: lobes with a small point on each
    g.beginPath();
    for (let i = 0; i <= 240; i++) {
      const a = i / 240 * 6.283, l = Math.abs(Math.cos(a * lobes / 2));
      const k = 1 - depth * (1 - Math.pow(l, 0.6)) + spike * Math.pow(l, 18);
      const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
  };
  // field with abrash: the red drifts a little from row to row, as dye lots do
  g.fillStyle = RED; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 6) { g.fillStyle = `rgba(${r() < 0.5 ? '60,10,5' : '255,140,90'},${r() * 0.06})`; g.fillRect(0, y, W, 6); }
  // borders: guard, main, guard
  const B = 62;
  g.fillStyle = WINE; g.fillRect(0, 0, W, H);
  g.fillStyle = CREAM; g.fillRect(6, 6, W - 12, H - 12);
  g.fillStyle = BLACK; g.fillRect(12, 12, W - 24, H - 24);
  g.fillStyle = RED; g.fillRect(B, B, W - 2 * B, H - 2 * B);
  g.strokeStyle = GOLD; g.lineWidth = 3; g.strokeRect(B - 6, B - 6, W - 2 * B + 12, H - 2 * B + 12);
  g.strokeStyle = CREAM; g.lineWidth = 2; g.strokeRect(B - 2, B - 2, W - 2 * B + 4, H - 2 * B + 4);
  // main border: a winding gold vine with rosettes in its bays
  const vine = (x0, y0, x1, y1) => {
    const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len, nx = -uy, ny = ux, step = 34;
    g.strokeStyle = GOLD; g.lineWidth = 2.5; g.beginPath();
    for (let t = 0; t <= len; t += 3) { const w = Math.sin(t / step * Math.PI) * 9; const x = x0 + ux * t + nx * w, y = y0 + uy * t + ny * w; t ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    for (let t = step / 2, i = 0; t < len; t += step, i++) {
      const side = i % 2 ? 1 : -1, x = x0 + ux * t + nx * side * 7, y = y0 + uy * t + ny * side * 7;
      rosette(x, y, 11, [CREAM, BLUE, ROSE][i % 3], i % 2 ? GOLD : BLACK, 6 + (i % 3));
      leaf(x - ux * 14, y - uy * 14, 6, Math.atan2(uy, ux) + 0.6 * side, '#6f8a4a');
    }
  };
  const m = (12 + B - 6) / 2;
  vine(m, m, W - m, m); vine(m, H - m, W - m, H - m); vine(m, m + 20, m, H - m - 20); vine(W - m, m + 20, W - m, H - m - 20);
  for (const [x, y] of [[m, m], [W - m, m], [m, H - m], [W - m, H - m]]) rosette(x, y, 16, CREAM, ROSE, 8);
  // corner pieces: a quarter of a lobed shape in navy, flowers inside
  quad(() => {
    const X = W / 2 - B, Y = H / 2 - B;
    g.fillStyle = NAVY; g.beginPath(); g.moveTo(X, Y);
    for (let i = 0; i <= 40; i++) { const a = Math.PI + i / 40 * Math.PI / 2, l = 1 + 0.12 * Math.cos(a * 8); g.lineTo(X + Math.cos(a) * 130 * l, Y + Math.sin(a) * 105 * l); }
    g.closePath(); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 2.5; g.stroke();
    for (let k = 0; k < 7; k++) rosette(X - 25 - r() * 80, Y - 20 - r() * 60, 7 + r() * 5, [CREAM, BLUE, GOLD][k % 3], ROSE, 6);
  });
  // the medallion, from the outside in
  lobed(250, 190, 8, 0.28, 0.1); g.fillStyle = GOLD; g.fill();
  lobed(242, 183, 8, 0.28, 0.1); g.fillStyle = NAVY; g.fill();
  lobed(200, 150, 8, 0.3, 0.12); g.fillStyle = RED; g.fill(); g.strokeStyle = CREAM; g.lineWidth = 2; g.stroke();
  lobed(150, 112, 6, 0.32, 0.14); g.fillStyle = BLACK; g.fill(); g.strokeStyle = GOLD; g.lineWidth = 2; g.stroke();
  lobed(98, 74, 4, 0.42, 0.25); g.fillStyle = CREAM; g.fill();
  lobed(64, 48, 4, 0.42, 0.25); g.fillStyle = ROSE; g.fill();
  rosette(cx, cy, 26, CREAM, NAVY, 8); rosette(cx, cy, 11, GOLD, WINE, 6);
  // pendants top and bottom of the medallion
  for (const sy of [-1, 1]) { g.fillStyle = NAVY; g.beginPath(); g.ellipse(cx, cy + sy * 205, 26, 18, 0, 0, 6.283); g.fill(); rosette(cx, cy + sy * 205, 12, CREAM, ROSE, 6); }
  // flowers strewn thick, mirrored: in the field, in the navy ring, in the black
  quad(() => {
    for (let k = 0; k < 230; k++) {
      const x = r() * (W / 2 - B - 8), y = r() * (H / 2 - B - 8);
      const e = (x / 250) ** 2 + (y / 190) ** 2;
      const inRing = e < 1 && e > 0.66, inBlack = (x / 150) ** 2 + (y / 112) ** 2 < 1 && (x / 98) ** 2 + (y / 74) ** 2 > 1.1;
      if (e < 1 && !inRing && !inBlack) continue;
      const size = inRing || inBlack ? 5 + r() * 4 : 6 + r() * 6;
      const col = inRing || inBlack ? [CREAM, GOLD, BLUE, ROSE][k % 4] : [CREAM, NAVY, GOLD, BLACK, BLUE][k % 5];
      if (r() < 0.3) leaf(x, y, size, r() * 3, inRing || inBlack ? '#7c9656' : BLACK);
      else rosette(x, y, size, col, r() < 0.5 ? WINE : GOLD, 5 + Math.floor(r() * 4));
    }
  });
  // pile: the pattern goes soft, as wool does, then thousands of short
  // fibres, each in the colour under it, a shade lighter or darker, leaning
  // every which way; the knots show as a faint grid
  g.filter = 'blur(1.3px)'; g.drawImage(c, 0, 0); g.filter = 'none';
  const px = g.getImageData(0, 0, W, H).data;
  g.lineCap = 'round';
  for (let i = 0; i < 50000; i++) {
    const x = r() * W, y = r() * H, k = (Math.floor(y) * W + Math.floor(x)) * 4;
    const sh = r() < 0.5 ? 0.72 + r() * 0.2 : 1.1 + r() * 0.25;
    g.strokeStyle = `rgba(${Math.min(255, px[k] * sh) | 0},${Math.min(255, px[k + 1] * sh) | 0},${Math.min(255, px[k + 2] * sh) | 0},0.5)`;
    g.lineWidth = 0.8 + r() * 0.9;
    const a2 = r() * 6.283, l = 1.5 + r() * 3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a2) * l, y + Math.sin(a2) * l); g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.05)';
  for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  const wear = g.createRadialGradient(W * (0.35 + r() * 0.3), H * 0.6, 10, W * 0.5, H * 0.6, W * 0.45);   // paler where shoulders brushed it
  wear.addColorStop(0, 'rgba(255,225,190,0.1)'); wear.addColorStop(1, 'rgba(255,225,190,0)');
  g.fillStyle = wear; g.fillRect(0, 0, W, H);
  return tex(c);
}

// ── memory: a rug on the parquet ────────────────────────────────────────────
// The red ornamental carpet the red rooms once had wall to wall, now cut to
// a rug 1.8 by 3 metres: a deep red field darkening to its border,
// wavy cream medallions, small motifs between, wool pile, fringe at the ends.
// pal: { field, dark, light } to take a lampshade's colours (kitchen.js SHADES)
export function rugTexture(seed, pal = null) {
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
  // pile, as on the wall carpets
  g.filter = 'blur(1.1px)'; g.drawImage(c, 0, 0); g.filter = 'none';
  const px = g.getImageData(0, 0, W, H).data;
  for (let i = 0; i < 26000; i++) {
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
