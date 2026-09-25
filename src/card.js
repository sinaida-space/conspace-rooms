// ── conspace-rooms · card.js ────────────────────────────────────────────────
// The end of a walk: every question the souls asked, on one 1080×1920 card
// to keep or post as a story. Black ground, the site's pixel font and
// phosphor greens, CONSPACE ROOMS on top with a light CRT tear, the two
// names in the bottom corners. Drawn on a canvas in the browser; nothing is
// sent anywhere. "Save image" downloads a PNG, or on a phone opens the share
// sheet where the browser offers one.

const W = 1080, H = 1920, PAD = 96;
const FG = '#baffc9', DIM = '#3f8a5a';
const FONT = '"Departure Mono", ui-monospace, monospace';

function wrap(g, text, width) {
  const words = text.split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > width && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// Draw the card. questions: strings in the order they were asked.
export function drawCard(canvas, { questions, heading, empty, boot }) {
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);

  // the command line, as on the welcome screen
  g.textBaseline = 'alphabetic';
  g.font = `400 30px ${FONT}`; g.fillStyle = DIM;
  g.fillText(boot, PAD, 150);

  // the wordmark: glow, then a light CRT tear (red and cyan ghosts, two
  // sliced rows pushed sideways)
  const title = 'CONSPACE ROOMS';
  g.font = `400 84px ${FONT}`;
  const tw = g.measureText(title).width, tx = (W - tw) / 2, ty = 300;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255, 40, 60, 0.35)'; g.fillText(title, tx - 5, ty);
  g.fillStyle = 'rgba(40, 220, 255, 0.3)'; g.fillText(title, tx + 5, ty + 1);
  g.globalCompositeOperation = 'source-over';
  g.shadowColor = 'rgba(57, 255, 106, 0.85)'; g.shadowBlur = 26;
  g.fillStyle = FG; g.fillText(title, tx, ty);
  g.shadowBlur = 0;
  for (const [y, h, dx] of [[ty - 52, 9, 14], [ty - 20, 6, -10]]) {
    const strip = g.getImageData(0, y, W, h);
    g.putImageData(strip, dx, y);
  }

  g.font = `400 34px ${FONT}`; g.fillStyle = DIM;
  const hw = g.measureText(heading).width;
  g.fillText(heading, (W - hw) / 2, 392);

  // the questions: numbered like /voprosy, shrinking until they all fit
  const top = 480, bottom = H - 230, width = W - PAD * 2 - 90;
  const list = questions.length ? questions : [empty];
  let size = 46, blocks;
  for (; size >= 22; size -= 2) {
    g.font = `400 ${size}px ${FONT}`;
    blocks = list.map(q => wrap(g, q, width));
    const lines = blocks.reduce((s, b) => s + b.length, 0);
    if (lines * size * 1.42 + (list.length - 1) * size * 0.75 <= bottom - top) break;
  }
  let y = top + size;
  blocks.forEach((lines, i) => {
    if (questions.length) {
      g.font = `400 ${Math.round(size * 0.72)}px ${FONT}`; g.fillStyle = DIM;
      g.fillText(String(i + 1).padStart(2, '0'), PAD, y);
    }
    g.font = `400 ${size}px ${FONT}`; g.fillStyle = FG;
    g.shadowColor = 'rgba(57, 255, 106, 0.35)'; g.shadowBlur = 10;
    for (const line of lines) { g.fillText(line, PAD + 90, y); y += size * 1.42; }
    g.shadowBlur = 0;
    y += size * 0.75;
  });

  // the names, in the bottom corners
  g.font = `400 34px ${FONT}`; g.fillStyle = FG;
  g.fillText('sinaida', PAD, H - 110);
  const u = 'uvaliss'; g.fillText(u, W - PAD - g.measureText(u).width, H - 110);
  g.fillStyle = DIM; const x = '×'; g.fillText(x, (W - g.measureText(x).width) / 2, H - 110);

  // CRT: scanlines, a faint phosphor grain, darker corners
  g.fillStyle = 'rgba(57, 255, 106, 0.035)';
  for (let sy = 0; sy < H; sy += 4) g.fillRect(0, sy, W, 1);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(186, 255, 201, ${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

// The overlay: the card, Save image, back to the labyrinth, walk again.
export async function showCard({ questions, strings, onBack, onAgain }) {
  try { await document.fonts?.load(`400 46px ${FONT}`); } catch (e) { /* draw with what there is */ }
  const wrapEl = document.createElement('div');
  wrapEl.id = 'final-card';
  wrapEl.setAttribute('role', 'dialog');
  wrapEl.setAttribute('aria-modal', 'true');
  wrapEl.setAttribute('aria-label', strings.heading);
  wrapEl.innerHTML = `<canvas class="fc-canvas"></canvas>
    <div class="fc-actions">
      <button type="button" class="btn-enter fc-save">${strings.save}</button>
      <button type="button" class="btn-enter fc-back dialog-no">${strings.back}</button>
      <button type="button" class="btn-enter fc-again dialog-no">${strings.again}</button>
    </div>`;
  const canvas = wrapEl.querySelector('canvas');
  drawCard(canvas, { questions, heading: strings.heading, empty: strings.empty, boot: strings.boot });
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', [strings.heading, ...questions].join('. '));
  document.body.appendChild(wrapEl);
  requestAnimationFrame(() => wrapEl.classList.add('visible'));
  wrapEl.querySelector('.fc-save').focus();

  const close = () => { wrapEl.remove(); removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') { close(); onBack?.(); } };
  addEventListener('keydown', onKey);
  wrapEl.querySelector('.fc-back').addEventListener('click', () => { close(); onBack?.(); });
  wrapEl.querySelector('.fc-again').addEventListener('click', () => onAgain?.());
  wrapEl.querySelector('.fc-save').addEventListener('click', () => {
    canvas.toBlob(async blob => {
      if (!blob) return;
      const name = 'conspace-rooms-souls.png';
      const file = new File([blob], name, { type: 'image/png' });
      const touch = matchMedia('(pointer: coarse)').matches;
      if (touch && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'CONSPACE ROOMS' }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  });
}

// Je suis le spectre d'une rose que tu portais hier au bal.
