import * as THREE from 'three';

// ── conspace-rooms · frames.js ──────────────────────────────────────────────
// A baroque picture frame big enough to walk through, used for the portals.
// Everything is painted on canvases once: carved gilt mouldings (bead row,
// acanthus scroll, egg-and-dart), corner cartouches and a shell crest. The
// gilding is old: scratched through to bright metal and chipped down to the
// red bole underneath, with grime settled in the carving. The textures carry
// their own light and shade, so the frame reads the same in every zone.

const GOLD_DARK = '#2a1a08', GOLD = '#7a5520', GOLD_MID = '#a67a2c', GOLD_HI = '#e6be62', BOLE = '#7a2a1a';
let TEX = null;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// Wear shared by every piece: scratches through the gilt, chips down to the
// bole, dark grime pooling in the recesses.
function age(g, w, h, density = 1) {
  for (let i = 0; i < 60 * density; i++) {             // chips: small ragged red-brown flakes
    const x = Math.random() * w, y = Math.random() * h, r = 2 + Math.random() * 7;
    g.fillStyle = BOLE; g.globalAlpha = 0.75;
    g.beginPath();
    for (let a = 0; a < 6.28; a += 0.9) g.lineTo(x + Math.cos(a) * r * (0.5 + Math.random()), y + Math.sin(a) * r * (0.5 + Math.random()));
    g.fill();
  }
  g.lineCap = 'round';
  for (let i = 0; i < 220 * density; i++) {            // scratches: thin jagged bright lines
    let x = Math.random() * w, y = Math.random() * h;
    const ang = (Math.random() - 0.5) * 1.2 + (Math.random() < 0.5 ? 0 : Math.PI / 2), len = 8 + Math.random() * 60;
    g.strokeStyle = Math.random() < 0.75 ? 'rgba(255,236,180,0.55)' : 'rgba(30,15,5,0.6)';
    g.lineWidth = 0.4 + Math.random() * 1.1; g.globalAlpha = 1;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < len; s += 4) { x += Math.cos(ang) * 4 + (Math.random() - 0.5); y += Math.sin(ang) * 4 + (Math.random() - 0.5); g.lineTo(x, y); }
    g.stroke();
  }
  const grime = g.createLinearGradient(0, 0, 0, h);
  grime.addColorStop(0, 'rgba(10,6,2,0.25)'); grime.addColorStop(0.5, 'rgba(10,6,2,0)'); grime.addColorStop(1, 'rgba(10,6,2,0.35)');
  g.globalAlpha = 1; g.fillStyle = grime; g.fillRect(0, 0, w, h);
}

// One straight length of moulding, drawn horizontally: outer bead row, a deep
// cove carved with acanthus C-scrolls, an egg-and-dart ogee, a sight edge.
function moulding() {
  const W = 1024, H = 160, c = canvas(W, H), g = c.getContext('2d');
  const band = (y0, y1, top, bottom) => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, y0, W, y1 - y0);
  };
  band(0, 14, GOLD_HI, GOLD);                          // outer fillet
  band(14, 34, GOLD_MID, GOLD_DARK);                   // bead row ground
  for (let x = 6; x < W; x += 14) {                    // beads
    const r = g.createRadialGradient(x - 2, 21, 1, x, 24, 7);
    r.addColorStop(0, GOLD_HI); r.addColorStop(1, GOLD_DARK);
    g.fillStyle = r; g.beginPath(); g.ellipse(x, 24, 5.5, 7, 0, 0, 7); g.fill();
  }
  band(34, 104, GOLD_DARK, GOLD);                      // cove
  for (let x = 0; x < W + 90; x += 90) {               // acanthus scrolls: C-curves with leafy lobes
    g.lineWidth = 7; g.strokeStyle = GOLD_MID;
    g.beginPath(); g.arc(x + 30, 69, 24, Math.PI * 0.2, Math.PI * 1.7); g.stroke();
    g.lineWidth = 3; g.strokeStyle = GOLD_HI;
    g.beginPath(); g.arc(x + 29, 67, 24, Math.PI * 0.9, Math.PI * 1.6); g.stroke();
    for (let k = 0; k < 5; k++) {                      // leaf lobes along the scroll
      const a = Math.PI * (0.35 + k * 0.28), lx = x + 30 + Math.cos(a) * 30, ly = 69 + Math.sin(a) * 30;
      const lg = g.createRadialGradient(lx - 2, ly - 3, 1, lx, ly, 10);
      lg.addColorStop(0, GOLD_HI); lg.addColorStop(1, GOLD);
      g.fillStyle = lg; g.beginPath(); g.ellipse(lx, ly, 9, 5, a, 0, 7); g.fill();
    }
    g.fillStyle = GOLD_HI; g.beginPath(); g.arc(x + 30, 69, 5, 0, 7); g.fill(); // scroll eye
  }
  band(104, 138, GOLD, GOLD_DARK);                     // ogee
  for (let x = 0; x < W; x += 26) {                    // egg and dart
    const eg = g.createRadialGradient(x + 11, 116, 1, x + 13, 121, 11);
    eg.addColorStop(0, GOLD_HI); eg.addColorStop(1, GOLD);
    g.fillStyle = eg; g.beginPath(); g.ellipse(x + 13, 121, 8, 11, 0, 0, 7); g.fill();
    g.fillStyle = GOLD_DARK; g.beginPath(); g.moveTo(x, 110); g.lineTo(x + 3, 134); g.lineTo(x - 3, 134); g.fill();
  }
  band(138, 160, GOLD_HI, GOLD_DARK);                  // sight edge
  age(g, W, H);
  return c;
}

// Corner cartouche: a carved rosette on a shield of scrolls.
function cartouche() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  const bg = g.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S * 0.7);
  bg.addColorStop(0, GOLD_MID); bg.addColorStop(1, GOLD_DARK);
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 8; k++) {                        // petals
    const a = k * Math.PI / 4;
    const pg = g.createRadialGradient(S / 2 + Math.cos(a) * 40, S / 2 + Math.sin(a) * 40, 2, S / 2 + Math.cos(a) * 50, S / 2 + Math.sin(a) * 50, 34);
    pg.addColorStop(0, GOLD_HI); pg.addColorStop(1, GOLD);
    g.fillStyle = pg; g.beginPath(); g.ellipse(S / 2 + Math.cos(a) * 52, S / 2 + Math.sin(a) * 52, 36, 16, a, 0, 7); g.fill();
  }
  const cg = g.createRadialGradient(S / 2 - 6, S / 2 - 6, 2, S / 2, S / 2, 30);
  cg.addColorStop(0, '#fff0c0'); cg.addColorStop(1, GOLD);
  g.fillStyle = cg; g.beginPath(); g.arc(S / 2, S / 2, 26, 0, 7); g.fill();
  g.lineWidth = 6; g.strokeStyle = GOLD_HI; g.strokeRect(8, 8, S - 16, S - 16);
  g.lineWidth = 3; g.strokeStyle = GOLD_DARK; g.strokeRect(16, 16, S - 32, S - 32);
  age(g, S, S, 0.5);
  return c;
}

// Shell crest for the top centre, on a transparent ground.
function crest() {
  const W = 512, H = 300, c = canvas(W, H), g = c.getContext('2d');
  const cx = W / 2, cy = H - 20;
  for (let k = -6; k <= 6; k++) {                      // fluted shell ribs fanning upward
    const a = -Math.PI / 2 + k * 0.2;
    const rg = g.createLinearGradient(cx, cy, cx + Math.cos(a) * 250, cy + Math.sin(a) * 250);
    rg.addColorStop(0, GOLD_DARK); rg.addColorStop(0.5, k % 2 ? GOLD_MID : GOLD_HI); rg.addColorStop(1, GOLD);
    g.fillStyle = rg;
    g.beginPath(); g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a - 0.1) * 250, cy + Math.sin(a - 0.1) * 250);
    g.quadraticCurveTo(cx + Math.cos(a) * 275, cy + Math.sin(a) * 275, cx + Math.cos(a + 0.1) * 250, cy + Math.sin(a + 0.1) * 250);
    g.closePath(); g.fill();
  }
  for (const s of [-1, 1]) {                           // volutes curling out at the base
    g.lineWidth = 16; g.strokeStyle = GOLD_MID;
    g.beginPath(); g.arc(cx + s * 170, cy - 30, 32, 0, Math.PI * 2 * 0.8); g.stroke();
    g.lineWidth = 5; g.strokeStyle = GOLD_HI;
    g.beginPath(); g.arc(cx + s * 170, cy - 32, 32, Math.PI, Math.PI * 1.6); g.stroke();
  }
  g.save(); g.globalCompositeOperation = 'source-atop'; age(g, W, H, 0.6); g.restore();
  return c;
}

function textures() {
  if (TEX) return TEX;
  const h = moulding();
  const v = canvas(h.height, h.width), vg = v.getContext('2d'); // the same moulding stood upright
  vg.translate(h.height, 0); vg.rotate(Math.PI / 2); vg.drawImage(h, 0, 0);
  TEX = { horiz: toTex(h), vert: toTex(v), corner: toTex(cartouche()), crest: toTex(crest()) };
  return TEX;
}

// Build the frame into a group, centred on its base, facing ±Z.
// opening: inner width/height in metres; rail: moulding width.
export function baroqueFrame(openW, openH, rail = 0.3) {
  const T = textures();
  const g = new THREE.Group();
  const depth = 0.14;
  const mat = map => new THREE.MeshBasicMaterial({ map, fog: true });
  const outerW = openW + rail * 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(outerW, rail, depth), mat(T.horiz));
  top.position.set(0, openH + rail / 2, 0); g.add(top);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(outerW, 0.06, depth), mat(T.horiz)); // a low threshold
  sill.position.set(0, 0.03, 0); g.add(sill);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(rail, openH, depth), mat(T.vert));
    side.position.set(s * (openW / 2 + rail / 2), openH / 2, 0); g.add(side);
    const corner = new THREE.Mesh(new THREE.BoxGeometry(rail * 1.25, rail * 1.25, depth + 0.03), mat(T.corner));
    corner.position.set(s * (openW / 2 + rail / 2), openH + rail / 2, 0); g.add(corner);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(rail * 1.1, rail * 1.1, depth + 0.02), mat(T.corner));
    foot.position.set(s * (openW / 2 + rail / 2), rail * 0.55, 0); g.add(foot);
  }
  const crestMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45),
    new THREE.MeshBasicMaterial({ map: T.crest, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, fog: true }));
  crestMesh.position.set(0, openH + rail + 0.12, 0); g.add(crestMesh); // stays under the 3.2 m ceiling
  return g;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
