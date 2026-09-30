import * as THREE from 'three';

// ── conspace-rooms · footdust.js ────────────────────────────────────────────
// Grey dust settling on the floor where the visitor has already walked, so a
// corridor walked twice looks walked: the way back reads as grey, the way on
// as clean floor (#53). One instanced draw of soft blotches, one per cell
// passed, grown in over a couple of seconds; the oldest go first when the
// pool is full. Cleared when the stage changes.

const POOL = 360;              // cells remembered
const SETTLE = 2.5;            // seconds a blotch takes to settle
const SIZE = 1.25;             // metres across, about one cell

function dustTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  r.addColorStop(0, 'rgba(255,255,255,0.55)'); r.addColorStop(0.6, 'rgba(255,255,255,0.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {                      // grit: the dust is grains, not a stain
    const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * 58;
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.35})`;
    g.fillRect(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createFootDust(scene, cell) {
  const mat = new THREE.MeshBasicMaterial({ map: dustTexture(), color: 0xcfcabd, transparent: true, opacity: 0.75,   // pale as ash: the floors are grey already depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -1 });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, POOL);
  mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 1;
  scene.add(mesh);
  const cells = [];                                     // { key, x, z, rot, s, t0 }
  const keys = new Set();
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  let growUntil = 0;

  const write = (i, c, k) => {
    Q.setFromAxisAngle(Y, c.rot);
    const s = SIZE * c.s * k;
    M.compose(V.set(c.x, 0.006, c.z), Q, S.set(s, 1, s));
    mesh.setMatrixAt(i, M);
  };

  return {
    // pos: the visitor on the floor plan ({x, y}); time: seconds
    update(pos, time, on = true) {
      mesh.visible = on;
      if (!on) return;
      const gi = Math.floor(pos.x / cell), gj = Math.floor(pos.y / cell), key = gi + ',' + gj;
      if (!keys.has(key)) {
        if (cells.length >= POOL) keys.delete(cells.shift().key);
        keys.add(key);
        cells.push({ key, x: (gi + 0.5) * cell + (Math.random() - 0.5) * 0.3, z: (gj + 0.5) * cell + (Math.random() - 0.5) * 0.3, rot: Math.random() * 6.28, s: 0.8 + Math.random() * 0.4, t0: time });
        cells.forEach((c, i) => write(i, c, Math.min(1, (time - c.t0) / SETTLE)));
        mesh.count = cells.length; mesh.instanceMatrix.needsUpdate = true;
        growUntil = time + SETTLE;
        return;
      }
      if (time > growUntil) return;                      // settled: nothing to write
      for (let i = Math.max(0, cells.length - 8); i < cells.length; i++) write(i, cells[i], Math.min(1, (time - cells[i].t0) / SETTLE));
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { cells.length = 0; keys.clear(); mesh.count = 0; },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
