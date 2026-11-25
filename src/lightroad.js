// ── conspace-rooms · lightroad.js ───────────────────────────────────────────
// The light's road: in acceptance, small warm lights float at knee height
// along the walked route to the nearest work not yet seen (the same route the
// marks follow, soulpath.js wayCells), round every corner. A slow wave of
// brightness runs along them away from the visitor, toward the work, so the
// way reads at a glance; they are drawn through the fog, never through walls.
// Amber and opaque, since the light's pale milk swallows any additive glow.
// When the route changes they glide to their new places; with no work to lead
// to they fade out.
import * as THREE from 'three';
import { calm } from './calm.js';

const COUNT = 15;           // lights in the road
const EVERY = 2;            // route cells between two lights
const FIRST = 2;            // the first light this many cells ahead of the visitor
const HEIGHT = 0.42;        // metres above the floor
const SIZE = 0.6;           // metres across the glow
const COLOR = 0xffa63a;     // amber: on the light's pale milk only a deep warm colour reads
const WAVE_SPEED = 1.4;     // radians per second: the wave running to the work
const WAVE_STEP = 0.55;     // radians between neighbouring lights
const GLIDE = 4;            // 1/s: how fast a light moves to its new place
const FADE = 1.5;           // 1/s: fading in and out

export function createLightRoad(scene, texture, cellCentre) {
  const lights = [];
  for (let i = 0; i < COUNT; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, color: COLOR, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.NormalBlending, fog: false,   // additive vanishes on milk
    }));
    s.scale.setScalar(SIZE);
    s.visible = false;
    s.renderOrder = 3;
    scene.add(s);
    lights.push({ s, a: 0, want: 0, x: 0, z: 0, placed: false });
  }

  return {
    // cells: the route as [gi, gj] from the visitor on · on: lead now or not
    update(dt, time, cells, on) {
      for (let i = 0; i < COUNT; i++) {
        const L = lights[i], c = on && cells ? cells[FIRST + i * EVERY] : null;
        L.want = c ? 1 - 0.35 * (i / COUNT) : 0;                 // the far end a little softer
        if (c) {
          const x = cellCentre(c[0]), z = cellCentre(c[1]);
          if (!L.placed || L.a < 0.05) { L.x = x; L.z = z; L.placed = true; }
          const g = Math.min(1, dt * GLIDE);
          L.x += (x - L.x) * g; L.z += (z - L.z) * g;
        }
        L.a += (L.want - L.a) * Math.min(1, dt * FADE);
        if (L.a < 0.01) { L.s.visible = false; L.a = Math.max(0, L.a); continue; }
        // the wave: brightest where it passes, a slow breath where it is not
        const w = calm.on ? 0.5 : Math.pow(Math.max(0, Math.sin(time * WAVE_SPEED - i * WAVE_STEP)), 6);
        const bob = Math.sin(time * 1.3 + i * 0.9) * 0.04;
        L.s.visible = true;
        L.s.position.set(L.x, HEIGHT + bob, L.z);
        L.s.material.opacity = L.a * (0.65 + 0.35 * w);
        L.s.scale.setScalar(SIZE * (0.85 + 0.45 * w));
      }
    },
    dispose() { for (const L of lights) { scene.remove(L.s); L.s.material.dispose(); } },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
