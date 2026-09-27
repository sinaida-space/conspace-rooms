// ── conspace-rooms · wallpaper.js ───────────────────────────────────────────
// Alisa's grandmother's wallpaper, from two photographs of the same wall,
// in the deep green the red rooms already had: a deep green ground under a fine gilt crosshatch, a gilt ogee
// trellis of scalloped cartouches, a pale bouquet of roses in each, lanced
// leaf ornaments where the trellis meets, all of it a little faded. One
// half-drop repeat, drawn on a canvas; tiles seamlessly.

const rnd = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

export function wallpaperCanvas(W = 760, H = 950, seed = 3) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rnd(seed);
  const GROUND = '#0f2b19', DEEP = '#0d2616', GOLD = '#c2a15c', GOLD_DIM = 'rgba(194,161,92,0.45)', LEAF = '#5f7d55';
  // the cartouche centres of one repeat: the middle, and the half-drop at the corners
  const centres = [[W / 2, H / 2], [0, 0], [W, 0], [0, H], [W, H]];
  const RX = W * 0.38, RY = H * 0.32;              // wide cartouches: most of the wall is plain ground
  const cartouche = (cx, cy, k) => {                    // a scalloped oval with a pointed top and bottom
    g.beginPath();
    for (let i = 0; i <= 200; i++) {
      const a = i / 200 * Math.PI * 2;
      const scal = 1 + 0.06 * Math.abs(Math.sin(a * 5));
      const point = 1 + 0.18 * Math.pow(Math.abs(Math.sin(a)), 12);   // the ogee points, up and down
      const x = cx + Math.cos(a) * RX * k * scal, y = cy + Math.sin(a) * RY * k * scal * point;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
  };
  // ground with a fine gilt crosshatch
  g.fillStyle = GROUND; g.fillRect(0, 0, W, H);
  // no lattice over the ground: it is almost all plain tone
  // the trellis: a double gilt line round each cartouche, the dark field inside
  for (const [cx, cy] of centres) {
    cartouche(cx, cy, 1.0); g.strokeStyle = 'rgba(194,161,92,0.5)'; g.lineWidth = 4; g.stroke();   // bold enough to read across a room
    cartouche(cx, cy, 0.95); g.fillStyle = DEEP; g.fill();
  }
  // the vensels where four cartouches meet: a tall ogee arch pointed top
  // and bottom, a smaller one inside, a trefoil at each point, C-scrolls
  // curling out at the waist, a diamond at the heart and a few beads
  const lance = (x, y, s) => {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.strokeStyle = GOLD; g.fillStyle = GOLD; g.lineCap = 'round';
    const ogee = (h, w, lw) => {
      g.lineWidth = lw; g.beginPath();
      g.moveTo(0, -h);
      g.bezierCurveTo(w * 0.15, -h * 0.75, w, -h * 0.45, w, 0);
      g.bezierCurveTo(w, h * 0.45, w * 0.15, h * 0.75, 0, h);
      g.bezierCurveTo(-w * 0.15, h * 0.75, -w, h * 0.45, -w, 0);
      g.bezierCurveTo(-w, -h * 0.45, -w * 0.15, -h * 0.75, 0, -h);
      g.stroke();
    };
    ogee(70, 34, 4); ogee(46, 19, 3);
    const trefoil = sy => {                              // a small three-lobed flame at the point
      g.save(); g.translate(0, sy * 74); g.scale(1, sy);
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(7, -6, 5, -18, 0, -24); g.bezierCurveTo(-5, -18, -7, -6, 0, 0); g.fill();
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(0, -2); g.bezierCurveTo(sx * 10, -2, sx * 16, -10, sx * 12, -18); g.lineWidth = 1.8; g.stroke(); }
      g.restore();
    };
    trefoil(-1); trefoil(1);
    for (const sx of [-1, 1]) {                          // C-scrolls at the waist
      g.lineWidth = 1.8; g.beginPath();
      g.moveTo(sx * 34, -10); g.bezierCurveTo(sx * 52, -16, sx * 58, 4, sx * 46, 8); g.bezierCurveTo(sx * 40, 10, sx * 38, 2, sx * 44, 0); g.stroke();
      g.beginPath(); g.moveTo(sx * 34, 10); g.bezierCurveTo(sx * 50, 18, sx * 54, 30, sx * 44, 32); g.stroke();
    }
    g.beginPath(); g.moveTo(0, -12); g.lineTo(7, 0); g.lineTo(0, 12); g.lineTo(-7, 0); g.closePath(); g.fill();   // the diamond at the heart
    for (const [bx, by] of [[0, -32], [0, 32], [-12, 0], [12, 0]]) { g.beginPath(); g.arc(bx, by, 2, 0, Math.PI * 2); g.fill(); }
    // the little flames that fringe the cartouches either side
    for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
      g.save(); g.translate(sx * 30, sy * 58); g.rotate(sx * sy * 0.6);
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(4, -4, 3, -11, 0, -15); g.bezierCurveTo(-3, -11, -4, -4, 0, 0); g.fill();
      g.restore();
    }
    g.restore();
  };
  for (const [x, y] of [[0, H / 2], [W, H / 2], [W / 2, 0], [W / 2, H]]) lance(x, y, 0.8);
  // the bouquet: a few pale roses, buds and leaves on thin stems
  const bouquet = (cx, cy) => {
    const rr = rnd(seed * 31 + Math.round(cx) * 7 + Math.round(cy));
    g.strokeStyle = LEAF; g.lineWidth = 1.6;
    for (let k = 0; k < 7; k++) {                       // stems gathered at the bottom
      g.beginPath(); g.moveTo(cx + (rr() - 0.5) * 8, cy + 70);
      g.quadraticCurveTo(cx + (rr() - 0.5) * 60, cy + 20, cx + (rr() - 0.5) * 90, cy - 40 + rr() * 50); g.stroke();
    }
    for (let k = 0; k < 11; k++) {                      // leaves
      const x = cx + (rr() - 0.5) * 110, y = cy - 50 + rr() * 110, a = rr() * Math.PI;
      g.fillStyle = LEAF; g.beginPath(); g.ellipse(x, y, 11, 4.5, a, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(40,40,50,0.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - Math.cos(a) * 10, y - Math.sin(a) * 10); g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); g.stroke();
    }
    const heads = [[0, -38, 17], [-30, -12, 15], [28, -16, 16], [-8, 12, 14], [34, 18, 11], [-36, 26, 10]];
    for (const [dx, dy, s] of heads) rose(cx + dx, cy + dy, s, rr);
    for (let k = 0; k < 4; k++) bud(cx + (rr() - 0.5) * 100, cy - 60 + rr() * 30, rr);
  };
  // a garden rose seen three-quarter on: outer petals cupped round, each
  // lighter at its lip, then tighter petals wrapping a dark heart
  const rose = (x, y, s, rr) => {
    const deep = '#8c1f2a', mid = '#b8323c', lip = '#e07a7e';
    g.save(); g.translate(x, y); g.rotate((rr() - 0.5) * 0.6);
    for (let k = 0; k < 6; k++) {                          // outer ring of cupped petals
      const a = k / 6 * Math.PI * 2 + rr() * 0.4;
      g.save(); g.rotate(a); g.translate(0, -s * 0.45);
      const gr = g.createLinearGradient(0, s * 0.45, 0, -s * 0.5);
      gr.addColorStop(0, deep); gr.addColorStop(0.7, mid); gr.addColorStop(1, lip);
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, s * 0.55, s * 0.5, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    for (let k = 0; k < 4; k++) {                          // the inner petals, wrapping
      g.strokeStyle = k % 2 ? lip : '#5e1019'; g.lineWidth = s * 0.14;
      g.beginPath(); g.arc(0, 0, s * (0.5 - k * 0.1), k * 1.7, k * 1.7 + 3.4); g.stroke();
    }
    g.fillStyle = '#4a0a12'; g.beginPath(); g.arc(s * 0.05, -s * 0.02, s * 0.12, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  const bud = (x, y, rr) => {
    g.fillStyle = LEAF; g.beginPath(); g.moveTo(x - 5, y + 4); g.lineTo(x, y + 12); g.lineTo(x + 5, y + 4); g.fill();
    g.fillStyle = '#a82b36'; g.beginPath(); g.ellipse(x, y, 4, 7, (rr() - 0.5) * 0.5, 0, Math.PI * 2); g.fill();
  };
  for (const [cx, cy] of centres) {                   // the bouquet fills its cartouche, as in the photographs
    g.save(); g.translate(cx, cy); g.scale(0.9, 0.9); g.translate(-cx, -cy); bouquet(cx, cy - 4); g.restore();
  }
  // printed ink sits a little soft, and the paper has faded unevenly
  g.filter = 'blur(0.6px)'; g.drawImage(c, 0, 0); g.filter = 'none';
  for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '220,210,190'},${r() * 0.05})`; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
  return c;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
