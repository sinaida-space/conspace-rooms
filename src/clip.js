// A walk clip: fifteen seconds of the labyrinth as an upright 9:16 video with
// its sound, the wordmark, the rose count and the address burnt in, made to be
// posted as a Reel or a TikTok. Everything happens in the browser: the frames
// are copied from the WebGL canvas right after each render, the sound is tapped
// from the master gain, MediaRecorder encodes, and the file goes to the share
// sheet (phones) or a download (desktop). Nothing is uploaded anywhere.

const W = 720, H = 1280, SECONDS = 15;
const MIMES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',   // Chrome 126+, Safari: plays everywhere, Instagram takes it
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

export function clipSupported() {
  return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream &&
    MIMES.some(m => MediaRecorder.isTypeSupported(m));
}

export function createClip({ source, audio, getCount, total, strings }) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  let rec = null, chunks = [], tap = null, badge = null, timer = 0;

  // cover-crop the landscape (or portrait) render into the upright frame
  function frame() {
    if (!rec) return;
    const sw = source.width, sh = source.height;
    const scale = Math.max(W / sw, H / sh);
    const cw = W / scale, ch = H / scale;
    g.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H);

    // soft vignettes so the lettering reads on the pale acceptance walls too
    let grad = g.createLinearGradient(0, 0, 0, 220);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, W, 220);
    grad = g.createLinearGradient(0, H - 260, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = grad; g.fillRect(0, H - 260, W, 260);

    g.textAlign = 'center';
    g.fillStyle = '#e8f5ea';
    g.font = '44px "Departure Mono", monospace';
    g.fillText('CONSPACE ROOMS', W / 2, 96);
    g.font = '22px "Departure Mono", monospace';
    g.fillStyle = 'rgba(232,245,234,0.8)';
    g.fillText('SOULS · UVALISS × SINAIDA', W / 2, 136);

    g.fillStyle = '#ff4a3d';
    g.font = '30px "Departure Mono", monospace';
    g.fillText(`${strings.roses} ${getCount()}/${total}`, W / 2, H - 132);
    g.fillStyle = '#e8f5ea';
    g.font = '26px "Departure Mono", monospace';
    g.fillText('conspace-rooms.vercel.app', W / 2, H - 82);
  }

  function start() {
    if (rec) return;
    const mime = MIMES.find(m => MediaRecorder.isTypeSupported(m));
    const stream = canvas.captureStream(30);
    if (audio?.ctx) {
      tap = audio.ctx.createMediaStreamDestination();
      audio.master.connect(tap);
      tap.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
    }
    chunks = [];
    rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 });
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => finish(mime, stream);
    rec.start(1000);

    badge = document.createElement('div');
    badge.className = 'clip-badge';
    badge.setAttribute('role', 'status');
    document.body.appendChild(badge);
    let left = SECONDS;
    const tick = () => { badge.textContent = `● ${strings.rec} ${left}`; };
    tick();
    timer = setInterval(() => { left--; if (left <= 0) stop(); else tick(); }, 1000);
  }

  function stop() {
    clearInterval(timer);
    if (rec?.state === 'recording') rec.stop();
  }

  function finish(mime, stream) {
    stream.getTracks().forEach(tr => tr.stop());
    try { tap && audio.master.disconnect(tap); } catch (e) { /* already gone */ }
    tap = null; rec = null;
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const file = new File([blob], `conspace-rooms.${ext}`, { type: blob.type });

    // the share sheet needs a fresh tap: the one that started the clip is 15 s old
    badge.textContent = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tape';
    btn.textContent = strings.save;
    badge.appendChild(btn);
    const drop = setTimeout(() => { badge?.remove(); badge = null; }, 30000);
    btn.addEventListener('click', async () => {
      clearTimeout(drop);
      badge?.remove(); badge = null;
      const touch = matchMedia('(pointer: coarse)').matches;
      if (touch && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'CONSPACE ROOMS', text: 'conspace-rooms.vercel.app' }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
  }

  return { start, frame, get recording() { return !!rec; } };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
