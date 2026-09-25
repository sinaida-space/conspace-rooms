// One dial every module reads. Tiers: 2 high, 1 medium, 0 low.
// Generalized foundation module — tiers carry no artwork-specific fields.
import { detectDevice } from './device.js';

const TABLE = [
  { name: 'LOW',    pixelRatio: 1,   post: false, particles: 900,  segments: 16 },
  { name: 'MEDIUM', pixelRatio: 1.25, post: true, particles: 2000, segments: 24 },
  { name: 'HIGH',   pixelRatio: 1.5,  post: true, particles: 3200, segments: 32 }, // CRT post hides the difference from 2×
];

export class Quality {
  constructor() {
    this.device = detectDevice();
    this.isMobile = this.device.isMobile;
    const forced = new URLSearchParams(location.search).get('tier');
    let saved = null;
    try { saved = localStorage.getItem('conspace-tier'); } catch (e) { /* storage blocked */ }
    this.forced = forced !== null;
    if (forced !== null) this.tier = +forced;
    else if (saved !== null) this.tier = +saved;
    else this.tier = this.detect();
    this.tier = Math.max(0, Math.min(2, this.tier | 0));
    // FPS governor state
    this._samples = [];
    this._cooldown = 0;
    this.onDowngrade = null;
  }

  detect() {
    if (this.device.isPhone) return 0; // phones: fixed low tier, governor cannot step up
    if (this.device.isTablet) return 1; // tablets: mid tier, governor may still step down
    // probe GPU name via a throwaway context
    let gpu = '';
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    } catch (e) { /* no webgl — main.js will show an error anyway */ }
    if (/(intel|iris|uhd|hd graphics)/i.test(gpu) && !/(arc)/i.test(gpu)) return 1;
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return 1;
    return 2;
  }

  get p() { return TABLE[this.tier]; }
  get canHands() { // hand tracking only where the GPU can afford a second model
    return !this.device.isPhone && this.tier >= 1 && this.device.hasCamera;
  }

  // called each frame with delta time; steps tier down under sustained low FPS
  govern(dt) {
    if (this.tier === 0) return;
    this._cooldown -= dt;
    this._samples.push(dt);
    if (this._samples.length < 120) return;
    const avg = this._samples.reduce((a, b) => a + b, 0) / this._samples.length;
    this._samples.length = 0;
    const target = this.isMobile ? 1 / 24 : 1 / 52; // desktop aims for 60: step down below ~52
    if (avg > target && this._cooldown <= 0) {
      this.tier--;
      this._cooldown = 12; // don't cascade
      console.warn('[quality] sustained low fps — stepping down to', this.p.name);
      if (this.onDowngrade) this.onDowngrade(this.tier);
    }
  }

  persist(allowed) {
    if (!allowed) return;
    try { localStorage.setItem('conspace-tier', String(this.tier)); } catch (e) {}
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
