import * as THREE from 'three';

// ── conspace-rooms · geom.js ────────────────────────────────────────────────
// A box with rounded edges and corners: a subdivided box whose vertices are
// pulled onto a rounded shell of radius r. Real furniture and mouldings are
// never knife-sharp; a few millimetres of radius is what makes them read as
// made things instead of blocks.
export function roundedBox(w, h, d, r = 0.01, seg = 3) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(
      Math.max(-inner.x, Math.min(inner.x, v.x)),
      Math.max(-inner.y, Math.min(inner.y, v.y)),
      Math.max(-inner.z, Math.min(inner.z, v.z)));
    const off = v.clone().sub(c);
    if (off.lengthSq() > 1e-12) v.copy(c).add(off.normalize().multiplyScalar(r));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
