// The finale's clouds. After the last work the view turns to the
// corridor and clouds well up from the floor all round, thick enough to hide
// the walls as they go; then the world is only cloud, and the visitor flies
// on through it, a sea of it below, banks of it above, a few puffs passed
// straight through at eye height.
//
// One instanced draw: every puff is a camera-facing quad whose soft, billowed
// edge is drawn in the fragment shader. The visitor does not move: the clouds
// stream past along the flight's direction, recycled from behind to ahead.

import * as THREE from 'three';

const N = 240, MIST = 48;   // clouds, and low mist that lies on the water once it shows
const AHEAD = 70, BEHIND = 12, SIDE = 22;   // metres of the field along the flight and either side of it

const VERT = /* glsl */`
uniform vec3 uCam;
uniform float uRise;      // 0: still under the floor, 1: in place
uniform float uTime;
uniform float uClear;     // 0..1: the puffs at eye height part, for the arch
attribute vec4 aPuff;     // xyz offset in the flight's frame (u along, v across, y up), w: size
attribute vec3 aTint;
attribute float aMist;    // 1: a mist puff, low on the water, only once the clouds part
varying vec2 vUv;
varying float vFade;
varying vec3 vTint;
varying float vSeed;
void main(){
  vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float s = aPuff.w;
  c.y -= (1.0 - uRise) * (4.0 + s);                       // they well up from below
  c.y -= (1.0 - aMist) * uClear * step(aPuff.z, 0.5) * step(abs(aPuff.y), 8.0) * (1.5 + 0.6 * s);   // ...along the way only: banks of it stay either side, on the water   // for the arch the sea sinks, so its path of light lies clear on it
  vec3 toCam = normalize(uCam - c);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
  vec3 up = cross(toCam, right);
  float breathe = 1.0 + 0.06 * sin(uTime * 0.4 + aPuff.x);
  vec3 p = c + (right * position.x + up * position.y) * s * breathe;
  vUv = uv;
  vTint = aTint;
  vSeed = aPuff.x * 0.37 + aPuff.z;
  float d = length(uCam - c);
  float mid = step(0.5, aPuff.z) * step(aPuff.z, 3.4) * (1.0 - aMist);
  vFade = mix(1.0, 0.4 * uClear, aMist) * (1.0 - uClear * mid) * smoothstep(0.6, 3.0, d) * (1.0 - smoothstep(AHEAD_F * 0.7, AHEAD_F, d));   // never a flat card in the face, nor a hard far edge
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`.replace(/AHEAD_F/g, AHEAD.toFixed(1));

const FRAG = /* glsl */`
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
varying float vFade;
varying vec3 vTint;
varying float vSeed;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 q = vUv * 2.0 - 1.0;
  float r = length(q);
  float b = 0.5 * n(q * 2.2 + vSeed + uTime * 0.03) + 0.3 * n(q * 5.0 - vSeed) + 0.2 * n(q * 11.0 + vSeed * 2.0);
  float body = smoothstep(1.0, 0.35, r + (b - 0.5) * 0.7);
  if (body < 0.01) discard;
  float lit = clamp(0.55 + 0.6 * q.y + 0.25 * b, 0.0, 1.0);      // the sun on their tops, a lilac shade under
  vec3 col = mix(vec3(0.74, 0.68, 0.78), vTint, lit);
  gl_FragColor = vec4(col, body * uAlpha * vFade);
}`;

export function createCloudSea(scene, camera) {
  const inst = new THREE.PlaneGeometry(1, 1);
  const puff = new Float32Array((N + MIST) * 4), tint = new Float32Array((N + MIST) * 3);
  const rnd = (() => { let s = 1224; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0) >>> 0) / 4294967296; })();
  const TINTS = [[1.0, 0.97, 0.93], [1.0, 0.92, 0.86], [0.99, 0.9, 0.92], [1.0, 0.95, 0.82]];
  const mist = new Float32Array(N + MIST);
  for (let i = 0; i < N + MIST; i++) {
    if (i >= N) {                                     // mist: low and wide along the way, round the candles
      puff.set([-6 + rnd() * 30, (rnd() * 2 - 1) * 7, 0.15 + rnd() * 0.5, 2.5 + rnd() * 3.5], i * 4);
      tint.set([1.0, 0.93, 0.88], i * 3); mist[i] = 1;
      continue;
    }
    const layer = rnd();
    const u = -BEHIND + rnd() * (AHEAD + BEHIND), v = (rnd() * 2 - 1) * SIDE;
    // a sea below, banks above, and one in eight drifting at eye height to fly through
    const y = layer < 0.55 ? -2.5 + rnd() * 2.2 : layer < 0.875 ? 4.5 + rnd() * 4 : 0.6 + rnd() * 2.6;
    const s = layer < 0.55 ? 7 + rnd() * 9 : layer < 0.875 ? 6 + rnd() * 8 : 2.5 + rnd() * 3;
    puff.set([u, v, y, s], i * 4);
    tint.set(TINTS[i % 4], i * 3);
  }
  inst.setAttribute('aPuff', new THREE.InstancedBufferAttribute(puff, 4));
  inst.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  inst.setAttribute('aMist', new THREE.InstancedBufferAttribute(mist, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uRise: { value: 0 }, uClear: { value: 0 }, uAlpha: { value: 0 }, uTime: { value: 0 } },
  });
  const mesh = new THREE.InstancedMesh(inst, mat, N + MIST);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  scene.add(mesh);
  const m4 = new THREE.Matrix4();
  let ox = 0, oz = 0, dx = 0, dz = -1, speed = 0, travel = 0;

  const place = () => {
    for (let i = 0; i < N + MIST; i++) {
      let u = puff[i * 4] - travel;
      u = ((u + BEHIND) % (AHEAD + BEHIND) + (AHEAD + BEHIND)) % (AHEAD + BEHIND) - BEHIND;   // behind the visitor: round to the far end
      const v = puff[i * 4 + 1];
      m4.makeTranslation(ox + dx * u - dz * v, puff[i * 4 + 2], oz + dz * u + dx * v);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  return {
    mesh,
    // origin: where the visitor stands · dir: the flight's direction on the floor
    start(origin, dir) {
      ox = origin.x; oz = origin.z;
      const l = Math.hypot(dir[0], dir[1]) || 1; dx = dir[0] / l; dz = dir[1] / l;
      travel = 0; speed = 0;
      mesh.visible = true;
      place();
    },
    // rise, alpha: 0..1 · fly: the flight's pace in m/s
    update(dt, t, { rise, alpha, fly, clear = 0 }) {
      if (!mesh.visible) return;
      speed += (fly - speed) * Math.min(1, dt * 0.6);
      travel += speed * dt;
      mat.uniforms.uRise.value = rise; mat.uniforms.uClear.value = clear; mat.uniforms.uAlpha.value = alpha; mat.uniforms.uTime.value = t;
      mat.uniforms.uCam.value.copy(camera.position);
      if (speed > 0.001) place();
    },
    dispose() { scene.remove(mesh); inst.dispose(); mat.dispose(); },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
