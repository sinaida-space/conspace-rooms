// ── conspace-rooms · zones.js ───────────────────────────────────────────────
// "Путь души": the labyrinth changes with distance from spawn, following the
// arc of the SOULS series (dedicated to Alisa's grandmother):
//   FEAR       institutional corridors, cold flickering tubes, damp green paint
//   MEMORY     grandmother's flat: wallpaper, a rug on the wall, warm lamps
//   ACCEPTANCE walls thin out and dissolve into light
// The same numbers drive the GLSL (materials.js injects them as #defines) and
// the JS side (fog, flicker rate, audio bed), so both always agree.

export const ZONE = {
  MEM_A: 45, MEM_B: 80,     // metres: fear → memory blend
  ACC_A: 135, ACC_B: 175,   // metres: memory → acceptance blend
};

// Spawn sits at local cell (4,4) of chunk (0,0); distances are measured from here.
export const ORIGIN = { x: 5.4, z: 5.4 };

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Weights that always sum to 1.
export function zoneWeights(x, z) {
  const d = Math.hypot(x - ORIGIN.x, z - ORIGIN.z);
  const m = smoothstep(ZONE.MEM_A, ZONE.MEM_B, d);
  const a = smoothstep(ZONE.ACC_A, ZONE.ACC_B, d);
  return { fear: 1 - m, memory: m * (1 - a), accept: a, dist: d };
}

// Mix three hex colours by zone weights into a THREE.Color-compatible target.
export function mixZone(target, w, fearHex, memHex, accHex) {
  const r = c => ((c >> 16) & 255) / 255, g = c => ((c >> 8) & 255) / 255, b = c => (c & 255) / 255;
  target.setRGB(
    r(fearHex) * w.fear + r(memHex) * w.memory + r(accHex) * w.accept,
    g(fearHex) * w.fear + g(memHex) * w.memory + g(accHex) * w.accept,
    b(fearHex) * w.fear + b(memHex) * w.memory + b(accHex) * w.accept,
  );
  return target;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
