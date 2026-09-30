// ── conspace-rooms · card.js ────────────────────────────────────────────────
// The end of a walk: every question the souls asked, on 1080×1920 cards
// to keep or post as a story. Black ground, the site's pixel font in one
// of four palettes (light violet by default), CONSPACE ROOMS on top with
// a light CRT tear, the two names in the bottom corners. Drawn on a canvas in the browser; nothing is
// sent anywhere. "Save image" downloads a PNG, or on a phone opens the share
// sheet where the browser offers one.

const W = 1080, H = 1920, PAD = 96;
// the card's colours: the letters, the quieter print, and the glow (r, g, b)
export const PALETTES = {
  violet: { fg: '#dccbff', dim: '#7d6aa8', glow: '170, 130, 255' },
  phosphor: { fg: '#baffc9', dim: '#3f8a5a', glow: '57, 255, 106' },
  rose: { fg: '#ffc4cd', dim: '#9a3a4c', glow: '255, 60, 90' },
  candle: { fg: '#ffe2b0', dim: '#a0703a', glow: '255, 170, 70' },
};
const PALETTE_KEY = 'conspace-card-palette';
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

// Split the questions over as many cards as it takes for the type to stay
// at MIN_SIZE or larger: a long walk gets two cards (or more), never a
// wall of tiny print. Returns [{ questions, first }] with first the number
// of the page's first question.
const TOP = 480, BOTTOM = H - 230, TEXT_W = W - PAD * 2 - 90, MIN_SIZE = 30;
const fits = (g, list, size) => {
  g.font = `400 ${size}px ${FONT}`;
  const lines = list.reduce((s, q) => s + wrap(g, q, TEXT_W).length, 0);
  return lines * size * 1.42 + (list.length - 1) * size * 0.75 <= BOTTOM - TOP;
};
export function paginate(questions) {
  if (!questions.length) return [{ questions, first: 1 }];
  const g = document.createElement('canvas').getContext('2d');
  const pages = [];
  let cur = [];
  for (const q of questions) {
    if (cur.length && !fits(g, cur.concat(q), MIN_SIZE)) { pages.push(cur); cur = []; }
    cur.push(q);
  }
  pages.push(cur);
  let n = 1;
  return pages.map(qs => { const p = { questions: qs, first: n }; n += qs.length; return p; });
}

// Draw one card. questions: strings in the order they were asked; first:
// the number of the first one; page / pages when the walk takes several.
export function drawCard(canvas, { questions, heading, empty, boot, first = 1, page = 1, pages = 1, palette = 'violet' }) {
  const { fg: FG, dim: DIM, glow: GLOW } = PALETTES[palette] || PALETTES.violet;
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
  g.shadowColor = `rgba(${GLOW}, 0.85)`; g.shadowBlur = 26;
  g.fillStyle = FG; g.fillText(title, tx, ty);
  g.shadowBlur = 0;
  for (const [y, h, dx] of [[ty - 52, 9, 14], [ty - 20, 6, -10]]) {
    const strip = g.getImageData(0, y, W, h);
    g.putImageData(strip, dx, y);
  }

  g.font = `400 34px ${FONT}`; g.fillStyle = DIM;
  const head = pages > 1 ? `${heading} · ${page}/${pages}` : heading;
  const hw = g.measureText(head).width;
  g.fillText(head, (W - hw) / 2, 392);

  // the questions: numbered like /voprosy, shrinking until they all fit
  const top = TOP, bottom = BOTTOM, width = TEXT_W;
  const list = questions.length ? questions : [empty];
  let size = 46;
  while (size > MIN_SIZE && !fits(g, list, size)) size -= 2;   // paginate() made sure MIN_SIZE fits
  g.font = `400 ${size}px ${FONT}`;
  const blocks = list.map(q => wrap(g, q, width));
  let y = top + size;
  blocks.forEach((lines, i) => {
    if (questions.length) {
      g.font = `400 ${Math.round(size * 0.72)}px ${FONT}`; g.fillStyle = DIM;
      g.fillText(String(first + i).padStart(2, '0'), PAD, y);
    }
    g.font = `400 ${size}px ${FONT}`; g.fillStyle = FG;
    g.shadowColor = `rgba(${GLOW}, 0.35)`; g.shadowBlur = 10;
    for (const line of lines) { g.fillText(line, PAD + 90, y); y += size * 1.42; }
    g.shadowBlur = 0;
    y += size * 0.75;
  });

  // the grain: one warm honey seed below the questions, the only warm colour
  // on the card (also drawn in the empty state)
  const gx = W / 2, gy = bottom + (H - 110 - bottom) / 2;
  const halo = g.createRadialGradient(gx, gy, 0, gx, gy, 50);
  halo.addColorStop(0, 'rgba(224, 176, 96, 0.5)'); halo.addColorStop(1, 'rgba(224, 176, 96, 0)');
  g.fillStyle = halo; g.fillRect(gx - 60, gy - 60, 120, 120);
  g.save();
  g.translate(gx, gy); g.rotate(-0.2);
  g.fillStyle = '#e0b060';
  g.beginPath(); g.ellipse(0, 0, 15, 9, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(120, 80, 30, 0.6)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -8); g.lineTo(0, 8); g.stroke();
  g.restore();

  // the names, in the bottom corners
  g.font = `400 34px ${FONT}`; g.fillStyle = FG;
  g.fillText('@sin.ai.da', PAD, H - 110);            // the Instagram tags, so a saved card finds its way back
  const u = '@uvaliss'; g.fillText(u, W - PAD - g.measureText(u).width, H - 110);
  g.fillStyle = DIM; const x = '×'; g.fillText(x, (W - g.measureText(x).width) / 2, H - 110);

  // CRT: scanlines, a faint phosphor grain, darker corners
  g.fillStyle = `rgba(${GLOW}, 0.035)`;
  for (let sy = 0; sy < H; sy += 4) g.fillRect(0, sy, W, 1);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${GLOW}, ${Math.random() * 0.04})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

// The overlay: a row of palettes above the card, the card, Save image,
// Home, Finish. Finish turns the overlay into a last screen: thanks, one
// farewell drawn at random, and the ways to find the two authors.
// strings: heading, empty, boot, save, home, finish, palette, palettes
// (names, in PALETTES order), thanks, farewells (list), links (the heading over them)
export async function showCard({ questions, strings, onHome, onFinish }) {
  try { await document.fonts?.load(`400 46px ${FONT}`); } catch (e) { /* draw with what there is */ }
  let palette = 'violet';
  try { const v = localStorage.getItem(PALETTE_KEY); if (PALETTES[v]) palette = v; } catch (e) { /* no storage: the default */ }
  const wrapEl = document.createElement('div');
  wrapEl.id = 'final-card';
  wrapEl.setAttribute('role', 'dialog');
  wrapEl.setAttribute('aria-modal', 'true');
  wrapEl.setAttribute('aria-label', strings.heading);
  const pages = paginate(questions);
  const swatch = (k, i) => `<button type="button" class="fc-swatch" data-p="${k}" style="--sw:${PALETTES[k].fg}" aria-label="${strings.palettes[i]}" aria-pressed="${k === palette}" title="${strings.palettes[i]}"></button>`;
  wrapEl.innerHTML = `<div class="fc-palette" role="group" aria-label="${strings.palette}">${Object.keys(PALETTES).map(swatch).join('')}</div>
    <div class="fc-pages">${pages.map(() => '<canvas class="fc-canvas"></canvas>').join('')}</div>
    <div class="fc-actions">
      <button type="button" class="btn-enter fc-save">${strings.save}</button>
      <button type="button" class="btn-enter fc-home dialog-no">${strings.home}</button>
      <button type="button" class="btn-enter fc-finish dialog-no">${strings.finish}</button>
    </div>`;
  const canvases = [...wrapEl.querySelectorAll('canvas')];
  const draw = () => pages.forEach((p, i) => {
    drawCard(canvases[i], { questions: p.questions, first: p.first, page: i + 1, pages: pages.length, heading: strings.heading, empty: strings.empty, boot: strings.boot, palette });
    const pal = PALETTES[palette];                   // the buttons and the frame take the card's colours too
    for (const [k, v] of [['--fc-glow', pal.glow], ['--accent', pal.fg], ['--fg', pal.fg], ['--dim', pal.dim]]) wrapEl.style.setProperty(k, v);
  });
  draw();
  canvases.forEach((c, i) => { c.setAttribute('role', 'img'); c.setAttribute('aria-label', [strings.heading, ...pages[i].questions].join('. ')); });
  document.body.appendChild(wrapEl);
  requestAnimationFrame(() => wrapEl.classList.add('visible'));
  wrapEl.querySelector('.fc-save').focus();

  wrapEl.querySelectorAll('.fc-swatch').forEach(b => b.addEventListener('click', () => {
    palette = b.dataset.p;
    try { localStorage.setItem(PALETTE_KEY, palette); } catch (e) { /* remembered for this card only */ }
    wrapEl.querySelectorAll('.fc-swatch').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    draw();
  }));
  wrapEl.querySelector('.fc-home').addEventListener('click', () => onHome?.());
  wrapEl.querySelector('.fc-finish').addEventListener('click', () => {
    const line = strings.farewells[Math.floor(Math.random() * strings.farewells.length)];
    const ext = 'target="_blank" rel="noopener"';
    wrapEl.classList.add('fc-end');
    wrapEl.innerHTML = `<div class="fc-bye">
      <p class="fc-thanks">${strings.thanks}</p>
      <p class="fc-line">${line}</p>
      <nav class="fc-links" aria-label="${strings.links}">
        <a href="https://sinaida.eu/" ${ext}>sinaida.eu</a>
        <a href="https://www.instagram.com/sin.ai.da" ${ext}>@sin.ai.da</a>
        <a href="https://uvaliss.ru/" ${ext}>uvaliss.ru</a>
        <a href="https://www.instagram.com/uvaliss/" ${ext}>@uvaliss</a>
      </nav>
      <button type="button" class="fc-home-quiet">${strings.home}</button>
    </div>`;
    wrapEl.querySelector('.fc-home-quiet').addEventListener('click', () => onHome?.());
    wrapEl.querySelector('.fc-home-quiet').focus();
    onFinish?.();
  });
  wrapEl.querySelector('.fc-save').addEventListener('click', async () => {
    const blobs = await Promise.all(canvases.map(c => new Promise(res => c.toBlob(res, 'image/png'))));
    if (blobs.some(b => !b)) return;
    const files = blobs.map((b, i) => new File([b], blobs.length > 1 ? `conspace-rooms-souls-${i + 1}.png` : 'conspace-rooms-souls.png', { type: 'image/png' }));
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.canShare?.({ files })) {
      try { await navigator.share({ files, title: 'CONSPACE ROOMS' }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    files.forEach((f, i) => setTimeout(() => {           // one download per card
      const url = URL.createObjectURL(f);
      const a = Object.assign(document.createElement('a'), { href: url, download: f.name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, i * 400));
  });
}

// Je suis le spectre d'une rose que tu portais hier au bal.
