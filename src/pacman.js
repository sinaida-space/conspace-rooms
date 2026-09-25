// ── conspace-rooms · pacman.js ──────────────────────────────────────────────
// Easter egg: click the CONSPACE ROOMS wordmark on the welcome screen and a
// small Pac-Man opens in the site's own phosphor greens. Arrows/WASD or swipe.
// Nothing is stored; the score lives only as long as the overlay.
import { t } from './i18n.js';

// # wall · _ void outside the maze · = ghost-house door (ghosts leave through it)
// . dot · o power pellet · P pac-man · G ghost. Row 9 is the wrap-around tunnel.
const MAP = [
  '###################',
  '#........#........#',
  '#o##.###.#.###.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.###.#.###.####',
  '___#.#...G...#.#___',
  '####.#.##=##.#.####',
  '.......#GGG#.......',
  '####.#.#####.#.####',
  '___#.#.......#.#___',
  '####.#.#####.#.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#.....P.....#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];
const W = MAP[0].length, H = MAP.length;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const COL = { bg: '#010805', fill: '#06180f', wall: '#3f8a5a', dot: '#baffc9', pac: '#39ff6a', ghost: '#baffc9', scared: '#3f8a5a' };

let open = false;

export function openPacman() {
  if (open) return;
  open = true;

  const root = document.createElement('div');
  root.id = 'pacman';
  root.innerHTML = `
    <div class="pac-bar"><span class="pac-score"></span><button type="button" class="pac-close" aria-label="${t('pacClose')}">× ${t('pacClose')}</button></div>
    <canvas></canvas>
    <p class="pac-hint">${t('pacHint')}</p>`;
  document.body.appendChild(root);
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = root.querySelector('.pac-score');

  // ── state ──
  let grid, pac, ghosts, score, lives, dotsLeft, scared, message, raf, last;
  function reset(full) {
    grid = MAP.map(r => r.split(''));
    dotsLeft = 0;
    ghosts = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid[y][x];
      if (c === '.' || c === 'o') dotsLeft++;
      if (c === 'P') { pac = mk(x, y, 'left', 6); grid[y][x] = ' '; }
      if (c === 'G') { ghosts.push(mk(x, y, 'up', 4.5, x, y, 2 + ghosts.length * 2)); grid[y][x] = ' '; }
    }
    if (full) { score = 0; lives = 3; }
    scared = 0; message = '';
  }
  function mk(x, y, dir, speed, hx = x, hy = y, wait = 0) {
    return { x, y, dir, next: dir, speed, hx, hy, wait };
  }
  function softReset() { // after losing a life: keep dots, reposition actors
    const g0 = MAP.map(r => r.split(''));
    let gi = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (g0[y][x] === 'P') Object.assign(pac, mk(x, y, 'left', 6));
      if (g0[y][x] === 'G') Object.assign(ghosts[gi], mk(x, y, 'up', 4.5, x, y, 2 + gi++ * 2));
    }
    scared = 0;
  }

  const wrapX = x => (x + W) % W;
  const cellAt = (x, y) => (y < 0 || y >= H ? '#' : grid[y][wrapX(x)]);
  const solid = c => c === '#' || c === '_' || c === '=';
  const wall = (x, y) => solid(cellAt(x, y));
  // ghosts may pass the door, but only on the way out (moving up)
  const ghostWall = (x, y, dir) => (cellAt(x, y) === '=' ? dir !== 'up' : wall(x, y));

  // Move one actor along the grid. Turns happen only at tile centres.
  function step(a, dt, chooser, blocked = wall) {
    if (!chooser && a.next === OPP[a.dir]) a.dir = a.next; // pac-man may reverse mid-tile
    let move = a.speed * dt;
    while (move > 0) {
      const cx = Math.round(a.x), cy = Math.round(a.y);
      const dist = Math.abs(a.x - cx) + Math.abs(a.y - cy);
      if (dist < 1e-6) {
        a.x = cx; a.y = cy;
        if (chooser) a.next = chooser(a, cx, cy);
        const [nx, ny] = DIRS[a.next];
        if (!blocked(cx + nx, cy + ny, a.next)) a.dir = a.next;
        const [dx, dy] = DIRS[a.dir];
        if (blocked(cx + dx, cy + dy, a.dir)) return; // stopped against a wall
      }
      const [dx, dy] = DIRS[a.dir];
      const tx = Math.round(a.x + dx * 0.5 + dx * 1e-3), ty = Math.round(a.y + dy * 0.5 + dy * 1e-3);
      const toCentre = Math.abs(tx - a.x) + Math.abs(ty - a.y) || 1;
      const d = Math.min(move, toCentre);
      a.x += dx * d; a.y += dy * d; move -= d;
      if (a.x < -0.5) a.x += W; if (a.x > W - 0.5) a.x -= W; // tunnel
    }
  }

  // Ghosts: at each junction pick the open direction that gets closest to pac
  // (or farthest while scared), never reversing, with a pinch of randomness.
  function ghostChoice(g, cx, cy) {
    const opts = Object.keys(DIRS).filter(d => d !== OPP[g.dir] && !ghostWall(cx + DIRS[d][0], cy + DIRS[d][1], d));
    if (!opts.length) return OPP[g.dir];
    if (Math.random() < 0.2) return opts[Math.floor(Math.random() * opts.length)];
    const score = d => Math.hypot(cx + DIRS[d][0] - pac.x, cy + DIRS[d][1] - pac.y) * (scared > 0 ? -1 : 1);
    return opts.sort((a, b) => score(a) - score(b))[0];
  }

  function update(dt) {
    if (message) return;
    step(pac, dt);
    const px = Math.round(pac.x), py = Math.round(pac.y);
    const cell = grid[py]?.[wrapX(px)];
    if (cell === '.' || cell === 'o') {
      grid[py][wrapX(px)] = ' ';
      dotsLeft--;
      score += cell === 'o' ? 50 : 10;
      if (cell === 'o') scared = 7;
      if (!dotsLeft) message = t('pacWin');
    }
    scared = Math.max(0, scared - dt);
    for (const g of ghosts) {
      if (g.wait > 0) { g.wait -= dt; continue; }
      g.speed = scared > 0 ? 3.2 : 4.5;
      step(g, dt, ghostChoice, ghostWall);
      if (Math.hypot(g.x - pac.x, g.y - pac.y) < 0.6) {
        if (scared > 0) { score += 200; Object.assign(g, mk(g.hx, g.hy, 'up', 5, g.hx, g.hy, 2)); }
        else if (--lives <= 0) message = t('pacLose');
        else softReset();
      }
    }
  }

  // ── drawing ──
  let s = 16, ox = 0, oy = 0;
  function fit() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const avail = Math.min(innerWidth - 32, (innerHeight - 140) * (W / H));
    s = Math.max(8, Math.floor(avail / W));
    canvas.style.width = `${s * W}px`; canvas.style.height = `${s * H}px`;
    canvas.width = s * W * dpr; canvas.height = s * H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ox = 0; oy = 0;
  }
  function draw(time) {
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, s * W, s * H);
    ctx.shadowBlur = s * 0.5;
    // walls: solid dark blocks, outlined in glowing green only where they
    // face a walkable tile, so every corridor reads as one clean channel
    ctx.shadowBlur = 0;
    ctx.fillStyle = COL.fill;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (grid[y][x] === '#') ctx.fillRect(x * s, y * s, s, s);
    }
    const walk = (x, y) => y >= 0 && y < H && x >= 0 && x < W && !solid(grid[y][x]);
    ctx.shadowBlur = s * 0.5;
    ctx.strokeStyle = COL.wall; ctx.shadowColor = COL.wall; ctx.lineWidth = Math.max(1.5, s * 0.14);
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (grid[y][x] !== '#') continue;
      const X = x * s, Y = y * s;
      if (walk(x, y - 1)) { ctx.moveTo(X, Y); ctx.lineTo(X + s, Y); }
      if (walk(x, y + 1)) { ctx.moveTo(X, Y + s); ctx.lineTo(X + s, Y + s); }
      if (walk(x - 1, y)) { ctx.moveTo(X, Y); ctx.lineTo(X, Y + s); }
      if (walk(x + 1, y)) { ctx.moveTo(X + s, Y); ctx.lineTo(X + s, Y + s); }
    }
    ctx.stroke();
    // ghost-house door: a dim bar
    ctx.fillStyle = COL.scared;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (grid[y][x] === '=') ctx.fillRect(x * s, y * s + s * 0.42, s, s * 0.16);
    }
    // dots and pellets
    ctx.fillStyle = COL.dot; ctx.shadowColor = COL.dot;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid[y][x];
      if (c !== '.' && c !== 'o') continue;
      const r = c === 'o' ? s * (0.24 + 0.05 * Math.sin(time * 6)) : s * 0.09;
      ctx.beginPath(); ctx.arc(ox + (x + 0.5) * s, oy + (y + 0.5) * s, r, 0, Math.PI * 2); ctx.fill();
    }
    // pac-man: mouth opens and closes, facing its direction
    const ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[pac.dir];
    const mouth = 0.25 * Math.abs(Math.sin(time * 10)) + 0.02;
    ctx.fillStyle = COL.pac; ctx.shadowColor = COL.pac;
    ctx.beginPath();
    const PX = ox + (pac.x + 0.5) * s, PY = oy + (pac.y + 0.5) * s;
    ctx.moveTo(PX, PY);
    ctx.arc(PX, PY, s * 0.42, ang + mouth * Math.PI, ang - mouth * Math.PI + Math.PI * 2);
    ctx.fill();
    // ghosts: outlined phosphor shapes; scared ones go dim and hollow
    for (const g of ghosts) {
      const X = ox + (g.x + 0.5) * s, Y = oy + (g.y + 0.5) * s, r = s * 0.42;
      const c = scared > 0 && !(scared < 2 && Math.floor(time * 6) % 2) ? COL.scared : COL.ghost;
      ctx.strokeStyle = c; ctx.shadowColor = c; ctx.lineWidth = Math.max(1, s * 0.1);
      ctx.beginPath();
      ctx.arc(X, Y - r * 0.1, r, Math.PI, 0);
      ctx.lineTo(X + r, Y + r);
      for (let i = 1; i <= 4; i++) ctx.lineTo(X + r - (i * r) / 2, Y + r - (i % 2 ? r * 0.35 : 0));
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = c;
      ctx.fillRect(X - r * 0.45, Y - r * 0.3, s * 0.1, s * 0.14);
      ctx.fillRect(X + r * 0.25, Y - r * 0.3, s * 0.1, s * 0.14);
    }
    ctx.shadowBlur = 0;
    scoreEl.textContent = `${t('pacScore')} ${score} · ${'♥'.repeat(Math.max(0, lives))}`;
    if (message) {
      ctx.fillStyle = 'rgba(1,8,5,0.8)'; ctx.fillRect(0, s * 8.5, s * W, s * 4);
      ctx.fillStyle = COL.pac; ctx.font = `${Math.max(12, s * 0.9)}px "Departure Mono", monospace`;
      ctx.textAlign = 'center'; ctx.fillText(message, (s * W) / 2, s * 10.4);
      ctx.fillStyle = COL.dot; ctx.font = `${Math.max(10, s * 0.6)}px "Departure Mono", monospace`;
      ctx.fillText(t('pacAgain'), (s * W) / 2, s * 11.6);
    }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - (last ?? now)) / 1000);
    last = now;
    update(dt);
    draw(now / 1000);
    raf = requestAnimationFrame(loop);
  }

  // ── input ──
  const keyMap = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  function onKey(e) {
    if (e.code === 'Escape') { close(); return; }
    if ((e.code === 'Enter' || e.code === 'Space') && message) { reset(true); e.preventDefault(); return; }
    const d = keyMap[e.code];
    if (d) { pac.next = d; e.preventDefault(); e.stopPropagation(); }
  }
  let sx = 0, sy = 0;
  const onStart = e => { const p = e.touches[0]; sx = p.clientX; sy = p.clientY; if (message) reset(true); };
  const onEnd = e => {
    const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    pac.next = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  };
  function close() {
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', fit);
    root.remove();
    open = false;
  }

  addEventListener('keydown', onKey, true);
  addEventListener('resize', fit);
  canvas.addEventListener('touchstart', onStart, { passive: true });
  canvas.addEventListener('touchend', onEnd, { passive: true });
  canvas.addEventListener('click', () => { if (message) reset(true); });
  root.querySelector('.pac-close').addEventListener('click', close);

  reset(true);
  fit();
  raf = requestAnimationFrame(loop);
}

// Je suis le spectre d'une rose que tu portais hier au bal.
