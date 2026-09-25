// ── conspace-rooms · gallery.js ─────────────────────────────────────────────
// Gallery mode (/gallery): the piece as an installation on a projector or a
// screen with a webcam. No gates, no buttons: the camera starts right away
// and watches for a face. Someone stands in front of it for a moment and the
// walk begins, steered by hands. Nobody there for a while and the attract
// screen comes back; the page reloads behind it, so the next visitor walks a
// new labyrinth (the seed is the time of day).
//
// URL parameters:
//   lang=ru|en    language (Russian by default)
//   idle=40       seconds with nobody in front before the walk resets
//   card=25       seconds the card of questions stays up before the reset
//   volume=0.9    master volume, 0..1
//   seed=<int>    one fixed labyrinth instead of a new one each time
//
// All video stays in the browser, as in the ordinary gesture mode.

import { HandInput } from './hands.js';
import { t } from './i18n.js';

const num = (k, d, lo, hi) => {
  const v = parseFloat(new URLSearchParams(location.search).get(k));
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
};

export function createGallery() {
  const params = { idle: num('idle', 40, 5, 600), card: num('card', 25, 5, 300), volume: num('volume', 0.9, 0, 1) };
  const attract = document.getElementById('attract');
  const line = document.getElementById('attract-line');
  const note = document.getElementById('attract-note');
  let hands = null, cameraOk = false;

  const show = (text) => { if (text) line.textContent = text; attract.classList.remove('gone'); };
  const hide = () => attract.classList.add('gone');

  addEventListener('keydown', e => {                 // F: fullscreen, for setups without a kiosk flag
    if (e.code !== 'KeyF' || e.repeat) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  return {
    params,
    get hands() { return hands; },

    // Start the camera and the detectors while the attract screen is up.
    async startCamera() {
      line.textContent = t('galleryCome');
      note.textContent = t('galleryCam');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
        hands = new HandInput(() => {}, () => {}, { faces: true });
        await hands.start(stream);
        cameraOk = true;
      } catch (e) {
        console.warn('[gallery] no camera:', e);
        line.textContent = t('galleryNoCam');
      }
    },

    // Resolves once someone has faced the screen for most of a second, or,
    // without a camera, at the first key or click.
    waitForVisitor() {
      return new Promise(res => {
        const enter = mode => { clearInterval(timer); hide(); res({ mode, cameraStream: null }); };
        let held = 0;
        const timer = setInterval(() => {
          if (!cameraOk) return;
          held = hands.faceWithin(400) ? held + 0.2 : 0;
          if (held >= 0.8) enter('hands');
        }, 200);
        const any = () => { if (!cameraOk) { removeEventListener('keydown', any); removeEventListener('pointerdown', any); enter('keys'); } };
        addEventListener('keydown', any);
        addEventListener('pointerdown', any);
      });
    },

    // While walking: nobody in front for `idle` seconds, or the card has had
    // its time, and the next labyrinth is prepared behind the attract screen.
    watch() {
      let cardSince = 0, leaving = false;
      setInterval(() => {
        if (leaving) return;
        const card = document.getElementById('final-card');
        cardSince = card ? cardSince + 1 : 0;
        const empty = cameraOk && hands.idleMs() > params.idle * 1000;
        if (empty || cardSince > params.card) {
          leaving = true;
          show(t('galleryBye'));
          note.textContent = '';
          setTimeout(() => location.reload(), 1800);
        }
      }, 1000);
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
