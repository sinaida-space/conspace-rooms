// Snake: opened by the flickering number on the 404 page, the version line in
// the footer, or the Konami code wherever the footer is on screen.
// Vanilla port of the SnakeEasterEgg from sinaida.eu, recoloured to this site:
// phosphor-green snake with an ECG pulse in its head, coral roses to eat.

const GRID = 20;             // cells
const CELL = 16;             // px per cell
const SIZE = GRID * CELL;    // 320px drawing buffer
const SPEEDS = [150, 110, 80, 60]; // ms per tick, one per level

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const OPP = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
const KEYS = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT',
};

const COPY = {
  en: { start: 'PRESS ANY KEY', swipe: 'or swipe to start', restart: 'PRESS R OR TAP TO RESTART', keys: '↑ ↓ ← → or WASD', close: 'Close' },
  ru: { start: 'НАЖМИ ЛЮБУЮ КЛАВИШУ', swipe: 'или смахни, чтобы начать', restart: 'R ИЛИ ТАП, ЧТОБЫ ЗАНОВО', keys: '↑ ↓ ← → или WASD', close: 'Закрыть' },
};

const STYLE = `
/* flat window over the page, the scanlines still run over it */
.snake-modal { position: fixed; inset: 0; z-index: 25; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(1, 8, 5, 0.88); }
.snake-panel { width: 100%; max-width: 344px; border: 1px solid var(--accent); background: var(--bg);
  box-shadow: 0 0 40px rgba(57, 255, 106, 0.18); }
.snake-bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px;
  padding: 6px 12px; border-bottom: 1px solid var(--dim); color: var(--accent); font-size: 0.85em; letter-spacing: 0.08em; }
.snake-bar b { font-weight: 400; }
.snake-hint { border-bottom: 0; border-top: 1px solid var(--dim); color: var(--dim); }
.snake-close, .snake-pad button { font: inherit; color: var(--accent); background: none; cursor: pointer; text-shadow: inherit; }
.snake-close { border: 0; padding: 0; }
.snake-panel canvas { display: block; width: calc(100% - 24px); height: auto; margin: 12px; outline: none; touch-action: none; }
.snake-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 0 12px 12px; }
.snake-pad button { border: 1px solid var(--dim); padding: 8px; }
@media (hover: hover) and (pointer: fine) { .snake-pad { display: none; } }`;

function randomFood(snake) {
  let p;
  do p = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
  while (snake.some(s => s.x === p.x && s.y === p.y));
  return p;
}

export function openSnake() {
  if (document.querySelector('.snake-modal')) return;
  if (!document.getElementById('snake-style')) {
    const st = document.createElement('style');
    st.id = 'snake-style'; st.textContent = STYLE;
    document.head.appendChild(st);
  }
  const t = COPY[document.documentElement.lang] || COPY.en;
  const C = { bg: css('--bg'), fg: css('--fg'), dim: css('--dim'), green: css('--accent'), rose: css('--tri-coral') };
  const font = size => `${size}px ${css('--font-dos')}`;
  const opener = document.activeElement;

  const modal = document.createElement('div');
  modal.className = 'snake-modal';
  modal.innerHTML = `
    <div class="snake-panel" role="dialog" aria-modal="true" aria-label="Snake">
      <div class="snake-bar"><span>SNAKE.EXE // SCORE: <b>0</b></span>
        <button class="snake-close" aria-label="${t.close}"><span aria-hidden="true">[X]</span></button></div>
      <canvas tabindex="-1" width="${SIZE}" height="${SIZE}"></canvas>
      <div class="snake-bar snake-hint"><span>${t.keys}</span></div>
      <div class="snake-pad">
        <span></span><button data-d="UP">↑</button><span></span>
        <button data-d="LEFT">←</button><button data-d="DOWN">↓</button><button data-d="RIGHT">→</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const canvas = modal.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = modal.querySelector('b');

  let s = { snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], dir: 'RIGHT', nextDir: 'RIGHT',
    food: { x: 15, y: 10 }, score: 0, dead: false, started: false };
  let timer = null, touch = null;

  function draw() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = 'rgba(63, 138, 90, 0.25)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(SIZE, i * CELL); ctx.stroke();
    }
    ctx.textAlign = 'center';

    if (!s.started) {
      ctx.fillStyle = C.green; ctx.font = font(13);
      ctx.fillText(t.start, SIZE / 2, SIZE / 2 - 10);
      ctx.fillStyle = C.dim; ctx.font = font(10);
      ctx.fillText(t.swipe, SIZE / 2, SIZE / 2 + 10);
      return;
    }

    // food: a coral rose that breathes
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 200);
    ctx.shadowColor = C.rose; ctx.shadowBlur = 8 * pulse;
    ctx.globalAlpha = pulse; ctx.fillStyle = C.rose;
    ctx.fillRect(s.food.x * CELL + 3, s.food.y * CELL + 3, CELL - 6, CELL - 6);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // snake: the tail fades toward the end
    s.snake.forEach((seg, i) => {
      const head = i === 0;
      ctx.globalAlpha = head ? 1 : 0.6 * (0.5 + 0.5 * (s.snake.length - i) / s.snake.length);
      ctx.fillStyle = C.green;
      ctx.shadowColor = C.green; ctx.shadowBlur = head ? 6 : 0;
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // ECG pulse across the head
    const h = s.snake[0], x = h.x * CELL, y = h.y * CELL;
    ctx.strokeStyle = C.bg; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + CELL / 2); ctx.lineTo(x + CELL * 0.3, y + CELL / 2);
    ctx.lineTo(x + CELL * 0.4, y + 2); ctx.lineTo(x + CELL * 0.6, y + CELL - 2);
    ctx.lineTo(x + CELL * 0.7, y + CELL / 2); ctx.lineTo(x + CELL, y + CELL / 2);
    ctx.stroke();

    if (s.dead) {
      ctx.fillStyle = 'rgba(1, 8, 5, 0.75)';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = C.rose; ctx.font = font(14);
      ctx.fillText('FLATLINE', SIZE / 2, SIZE / 2 - 20);
      ctx.fillStyle = C.fg; ctx.font = font(10);
      ctx.fillText(`SCORE: ${s.score}`, SIZE / 2, SIZE / 2);
      ctx.fillStyle = C.dim;
      ctx.fillText(t.restart, SIZE / 2, SIZE / 2 + 20);
    }
  }

  function tick() {
    if (s.dead || !s.started) return;
    s.dir = s.nextDir;
    const h = s.snake[0];
    const next = {
      x: (h.x + (s.dir === 'RIGHT' ? 1 : s.dir === 'LEFT' ? -1 : 0) + GRID) % GRID,
      y: (h.y + (s.dir === 'DOWN' ? 1 : s.dir === 'UP' ? -1 : 0) + GRID) % GRID,
    };
    if (s.snake.some(seg => seg.x === next.x && seg.y === next.y)) { s.dead = true; draw(); return; }
    const ate = next.x === s.food.x && next.y === s.food.y;
    s.snake.unshift(next);
    if (!ate) s.snake.pop();
    else { s.score += 10; s.food = randomFood(s.snake); scoreEl.textContent = s.score; }
    draw();
    timer = setTimeout(tick, SPEEDS[Math.min(3, Math.floor(s.score / 50))]);
  }

  function reset() {
    clearTimeout(timer);
    const snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    s = { snake, dir: 'RIGHT', nextDir: 'RIGHT', food: randomFood(snake), score: 0, dead: false, started: true };
    scoreEl.textContent = 0;
    draw();
    timer = setTimeout(tick, SPEEDS[0]);
  }

  function setDir(d) {
    if (!s.started || s.dead) { reset(); return; }
    if (d !== OPP[s.dir]) s.nextDir = d;
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'r', 'R'].includes(e.key)) e.preventDefault();
    if (e.key === 'Tab') return;
    if (!s.started) { reset(); return; }
    if (s.dead && (e.key === 'r' || e.key === 'R')) { reset(); return; }
    if (KEYS[e.key]) setDir(KEYS[e.key]);
  }

  function onTouchStart(e) {
    e.preventDefault();
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (!s.started) reset();
  }
  function onTouchEnd(e) {
    e.preventDefault();
    if (!touch) return;
    if (s.dead) { touch = null; reset(); return; }
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'RIGHT' : 'LEFT') : (dy > 0 ? 'DOWN' : 'UP'));
  }

  function close() {
    clearTimeout(timer);
    window.removeEventListener('keydown', onKey);
    modal.remove();
    if (opener && opener.focus) opener.focus();
  }

  window.addEventListener('keydown', onKey);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.querySelector('.snake-close').addEventListener('click', close);
  modal.querySelectorAll('.snake-pad button').forEach(b => b.addEventListener('click', () => setDir(b.dataset.d)));

  document.fonts.ready.then(draw);
  draw();
  canvas.focus();
}

// Je suis le spectre d'une rose que tu portais hier au bal.
