import * as THREE from 'three';

// ── conspace-rooms · petals.js ──────────────────────────────────────────────
// Grain. Two moments that come out of the rose in the top-left corner:
//
//   sparkle()   a handful of bright sparkles spills from the corner in a
//               cone, diagonally down and across the screen, spiralling
//               round its axis as it widens, twinkles and goes out
//   stream()    the finale: the corner rose's petals pour into the world with
//               honey-gold dust, swirl toward the rose arch while it rises and
//               then drift through the tunnel into its light, looping there
//
// Everything moves on the GPU. The CPU writes the particle buffers only when
// something is emitted; update() just advances the clock uniform. Three draw
// calls at most: sparkles, petals, dust.

const SPARKLES = [40, 60, 80];
const PETALS = [120, 250, 400];
const DUST = [600, 1500, 2500];
const CORNER_NDC = [-0.85, 0.8];    // where the rose counter sits on screen
const CORNER_DEPTH = 0.6;           // metres in front of the eye
const EMIT = 2.5;                   // seconds the stream keeps pouring out

// ── sparkles ────────────────────────────────────────────────────────────────
const SPARK_VERT = /* glsl */`
uniform float uTime, uSpeed, uViewH;
attribute vec3 aVel;          // velocity along the cone's axis (world), set from the camera at emission
attribute vec3 aS1, aS2;      // two axes across the cone, scaled by how fast this one drifts off the axis
attribute float aBirth;       // clock time of birth
attribute float aSeed;
varying float vA;
varying vec3 vCol;
void main(){
  float age = uTime - aBirth;
  float life = mix(2.2, 3.0, fract(aSeed * 13.7));
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float mt = age * uSpeed;                                    // motion time
  // out along the cone's axis, further off it the longer it flies, and
  // round it: the handful turns as one, a slow spiral that widens
  float th = aSeed * 6.2832 + mt * mix(2.4, 3.6, fract(aSeed * 5.1));
  vec3 p = position + aVel * mt + (aS1 * cos(th) + aS2 * sin(th)) * mt
         + vec3(0.0, -0.012, 0.0) * mt * mt;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(0.020, 0.034, fract(aSeed * 7.3));        // world size, flare included
  gl_PointSize = min(64.0, size * projectionMatrix[1][1] * uViewH * 0.5 / max(0.05, -mv.z));
  // fade in fast, out over the last 40 % of life; twinkle on top
  float fade = smoothstep(0.0, 0.08, age) * smoothstep(life, life * 0.6, age);
  float tw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * mix(9.0, 18.0, aSeed) + aSeed * 40.0), 4.0);
  vA = fade * tw;
  vCol = mix(vec3(1.0, 0.97, 0.88), vec3(1.0, 0.74, 0.32), fract(aSeed * 3.1));   // warm white to honey
}`;

const SPARK_FRAG = /* glsl */`
varying float vA;
varying vec3 vCol;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float core = exp(-r * r * 70.0);                               // hot centre
  float flare = exp(-abs(c.x) * 45.0) * exp(-abs(c.y) * 6.0)     // four-point flare
              + exp(-abs(c.y) * 45.0) * exp(-abs(c.x) * 6.0);
  float k = (core * 1.9 + flare * 0.7) * smoothstep(0.5, 0.3, r) * vA;
  if (k < 0.003) discard;
  gl_FragColor = vec4(vCol * k, k);                              // core > 1: blooms in post
}`;

// ── the stream: petals and dust on one analytic swirl ──────────────────────
// position = start point (the corner). Travel: a cubic from the corner into
// the tunnel mouth with a helix wound around it, radius zero at both ends.
// Then drift: ease toward a resting point near the far glow and loop there.
const FLOW = /* glsl */`
uniform float uTime, uSpeed, uViewH, uLen;
uniform vec3 uE;              // arch entrance, on the floor
uniform vec3 uDir;            // into the tunnel, horizontal
uniform vec3 uSide;           // across the tunnel, horizontal
uniform vec3 uCorner, uCorner0;  // the on-screen corner now, and at stream()
attribute float aBirth;
attribute vec4 aRand;         // four independent randoms per particle
float h(float x){ return fract(sin(x * 91.345) * 47453.21); }
vec3 bez(vec3 a, vec3 b, vec3 c, vec3 d, float s){
  float r = 1.0 - s;
  return r * r * r * a + 3.0 * r * r * s * b + 3.0 * r * s * s * c + s * s * s * d;
}
// where the particle is at motion time mt; k = how far into the light (0..1)
vec3 flow(float mt, out float k){
  vec3 up = vec3(0.0, 1.0, 0.0);
  float T = mix(3.0, 4.0, aRand.x);                                  // travel time
  vec3 M = uE + uDir * mix(0.4, 1.6, aRand.y) + up * mix(1.1, 1.9, aRand.z) + uSide * (aRand.w - 0.5) * 0.9;
  if (mt < T) {
    float s = mt / T;
    // the start follows the on-screen corner while the view turns; the cubic
    // weights it by (1 - s)^3, so the longer a particle has flown, the less
    // it is pulled along. uCorner stops moving once the last one is born.
    vec3 C = position + (uCorner - uCorner0);
    vec3 P1 = mix(C, uE + up * 1.5, 0.35) + up * 0.35;
    vec3 P2 = uE - uDir * 0.6 + up * 1.5;
    vec3 base = bez(C, P1, P2, M, s);
    // helix around the path, its radius breathing with a few rotating sines
    float th = aRand.w * 6.2832 + s * mix(1.5, 3.2, h(aRand.x + 0.3)) * 6.2832;
    float R = mix(RMIN, RMAX, h(aRand.y + 1.7)) * (1.0 + 0.3 * sin(3.0 * th + aRand.z * 6.2832));
    float r = R * pow(sin(3.14159 * s), 2.0);
    vec3 off = uSide * cos(th) + up * sin(th) * 0.8
             + uDir * 0.25 * sin(2.0 * th + aRand.x * 6.2832);
    k = 0.2 * s;
    return base + off * r;
  }
  // drift through the tunnel toward the far glow, then loop gently in it
  float tau = mt - T;
  vec3 Q = uE + uDir * mix(QNEAR * uLen, uLen + 0.1, h(aRand.z + 2.9))
         + up * mix(HLOW, HHIGH, h(aRand.w + 4.1)) + uSide * (h(aRand.x + 5.3) - 0.5) * SPREAD;
  float e = 1.0 - exp(-tau / 5.0);
  float w = mix(0.25, 0.55, h(aRand.y + 6.7)), ph = aRand.z * 6.2832, A = mix(0.12, 0.4, h(aRand.w + 8.2));
  vec3 loop = uSide * sin(w * tau + ph) * A + up * sin(w * 1.3 * tau + ph * 1.7) * A * 0.5
            + uDir * (cos(w * tau + ph) - 1.0) * A * 0.3;
  k = mix(0.2, 1.0, e);
  return mix(M, Q, e) + loop * (1.0 - exp(-tau / 2.0));
}`;

const PETAL_VERT = /* glsl */`
#define RMIN 0.15
#define RMAX 0.5
#define QNEAR 0.55
#define HLOW 0.8
#define HHIGH 2.3
#define SPREAD 1.3
${FLOW}
varying vec2 vSpin;           // in-plane angle, cos of the tumble (flip)
varying float vLight;
void main(){
  float age = uTime - aBirth;
  if (age < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float mt = age * uSpeed, k;
  vec3 p = flow(mt, k);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(0.035, 0.06, aRand.y) * smoothstep(0.0, 0.5, age);   // grows out of the rose
  gl_PointSize = min(80.0, size * projectionMatrix[1][1] * uViewH * 0.5 / max(0.05, -mv.z));
  vSpin = vec2(aRand.x * 6.2832 + mt * mix(-2.5, 2.5, aRand.z),
               cos(aRand.w * 6.2832 + mt * mix(2.0, 4.0, aRand.y)));
  vLight = mix(0.75, 1.35, k) * smoothstep(0.1, 0.25, -mv.z);
}`;

const PETAL_FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vSpin;
varying float vLight;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vSpin.x), s = sin(vSpin.x);
  p = mat2(c, -s, s, c) * p;
  p.x /= max(abs(vSpin.y), 0.12);                 // flipping: squeeze across the petal
  if (abs(p.x) > 0.5 || abs(p.y) > 0.5) discard;
  vec4 t = texture2D(uMap, p + 0.5);
  if (t.a < 0.5) discard;
  float back = vSpin.y < 0.0 ? 0.72 : 1.0;        // the underside is a shade darker
  vec3 col = t.rgb * back * vLight;
  col = mix(col, col * vec3(1.0, 0.92, 0.82) + vec3(0.06, 0.04, 0.02), clamp(vLight - 1.0, 0.0, 1.0));   // warmed by the arch light
  gl_FragColor = vec4(col, 1.0);
}`;

const DUST_VERT = /* glsl */`
#define RMIN 0.1
#define RMAX 0.7
#define QNEAR 0.05
#define HLOW 0.3
#define HHIGH 2.6
#define SPREAD 1.8
${FLOW}
varying float vA;
void main(){
  float age = uTime - aBirth;
  if (age < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float mt = age * uSpeed, k;
  vec3 p = flow(mt, k);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(0.005, 0.011, aRand.x);
  gl_PointSize = min(20.0, size * projectionMatrix[1][1] * uViewH * 0.5 / max(0.05, -mv.z));
  float tw = 0.6 + 0.4 * sin(uTime * mix(2.0, 6.0, aRand.y) + aRand.z * 30.0);
  vA = smoothstep(0.0, 0.4, age) * tw * mix(0.45, 1.0, aRand.w) * mix(0.8, 1.5, k)
     * smoothstep(0.08, 0.3, -mv.z) * smoothstep(24.0, 10.0, -mv.z);
}`;

const DUST_FRAG = /* glsl */`
varying float vA;
void main(){
  float r = length(gl_PointCoord - 0.5);
  float a = min(1.0, smoothstep(0.5, 0.0, r) * vA);
  if (a < 0.01) discard;
  // emissive "over": glows like additive on the dark, and still tints the
  // white far glow gold instead of vanishing into it
  gl_FragColor = vec4(vec3(1.0, 0.74, 0.3) * a * 1.15, a);      // honey gold
}`;

// one petal, pointing up, in the rose's reds
function petalTexture() {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.beginPath();
  g.moveTo(0, 26);
  g.bezierCurveTo(-24, 18, -22, -22, 0, -28);
  g.bezierCurveTo(22, -22, 24, 18, 0, 26);
  g.closePath();
  const grad = g.createLinearGradient(0, 26, 0, -28);
  grad.addColorStop(0, '#8e0f15');           // the base, deep
  grad.addColorStop(0.55, '#c3141c');
  grad.addColorStop(1, '#f0707a');           // the velvet rim catches light
  g.fillStyle = grad; g.fill();
  g.strokeStyle = 'rgba(80, 4, 10, 0.35)'; g.lineWidth = 1;   // a faint vein
  g.beginPath(); g.moveTo(0, 22); g.quadraticCurveTo(2, 0, 0, -20); g.stroke();
  return new THREE.CanvasTexture(c);          // raw sRGB values, written as is (like dust.js)
}

export function createPetals(scene, camera, quality) {
  const tier = Math.max(0, Math.min(2, quality.tier | 0));
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const count = list => Math.max(1, Math.round(list[tier] * (reduced ? 0.3 : 1)));
  const nSpark = count(SPARKLES), nPetal = count(PETALS), nDust = count(DUST);

  // shared uniforms: one clock for all three
  const shared = {
    uTime: { value: 0 }, uSpeed: { value: reduced ? 0.6 : 1 }, uViewH: { value: 1 },
  };
  const flowU = {
    ...shared, uLen: { value: 1 },
    uE: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) }, uSide: { value: new THREE.Vector3(1, 0, 0) },
    uCorner: { value: new THREE.Vector3() }, uCorner0: { value: new THREE.Vector3() },
  };

  // sparkles: a ring of two handfuls, so a second call does not cut the first
  const sPool = nSpark * 2;
  const sGeo = new THREE.BufferGeometry();
  const sPos = new THREE.BufferAttribute(new Float32Array(sPool * 3), 3);
  const sVel = new THREE.BufferAttribute(new Float32Array(sPool * 3), 3);
  const sBirth = new THREE.BufferAttribute(new Float32Array(sPool).fill(-1e4), 1);
  const sSeed = new THREE.BufferAttribute(new Float32Array(sPool), 1);
  const sS1 = new THREE.BufferAttribute(new Float32Array(sPool * 3), 3), sS2 = new THREE.BufferAttribute(new Float32Array(sPool * 3), 3);
  sGeo.setAttribute('position', sPos); sGeo.setAttribute('aVel', sVel);
  sGeo.setAttribute('aS1', sS1); sGeo.setAttribute('aS2', sS2);
  sGeo.setAttribute('aBirth', sBirth); sGeo.setAttribute('aSeed', sSeed);
  const sMat = new THREE.ShaderMaterial({
    vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, uniforms: shared,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sparkles = new THREE.Points(sGeo, sMat);

  // petals and dust share the flow
  const streamGeo = n => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aBirth', new THREE.BufferAttribute(new Float32Array(n), 1));
    geo.setAttribute('aRand', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    return geo;
  };
  const pGeo = streamGeo(nPetal), dGeo = streamGeo(nDust);
  const map = petalTexture();
  const pMat = new THREE.ShaderMaterial({
    vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG, uniforms: { ...flowU, uMap: { value: map } },
    transparent: true, depthWrite: true,
  });
  const dMat = new THREE.ShaderMaterial({
    vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: flowU,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const petals = new THREE.Points(pGeo, pMat), dust = new THREE.Points(dGeo, dMat);

  // positions are computed on the GPU: never cull; additive layers draw last
  [[petals, 10], [dust, 11], [sparkles, 12]].forEach(([o, order]) => {
    o.frustumCulled = false; o.renderOrder = order; o.visible = false; scene.add(o);
  });

  let now = 0, head = 0, sparkEnd = -1, followEnd = -1;
  const _c = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();

  // the corner point in world space, and the camera's axes, right now
  function corner() {
    camera.updateMatrixWorld();
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    _c.set(CORNER_NDC[0] * ty * camera.aspect * CORNER_DEPTH, CORNER_NDC[1] * ty * CORNER_DEPTH, -CORNER_DEPTH)
      .applyMatrix4(camera.matrixWorld);
    _r.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    _u.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    _f.setFromMatrixColumn(camera.matrixWorld, 2).normalize().negate();
  }

  // fill a stream geometry: all start at the corner, born over EMIT seconds
  function seed(geo, n) {
    const pos = geo.attributes.position, birth = geo.attributes.aBirth, rnd = geo.attributes.aRand;
    const j = () => (Math.random() - 0.5) * 0.03;
    for (let i = 0; i < n; i++) {
      pos.setXYZ(i, _c.x + j(), _c.y + j(), _c.z + j());
      birth.setX(i, now + (i / n) * EMIT + Math.random() * 0.05);
      rnd.setXYZW(i, Math.random(), Math.random(), Math.random(), Math.random());
    }
    pos.needsUpdate = birth.needsUpdate = rnd.needsUpdate = true;
  }

  return {
    // one handful of sparkles from the top-left corner; repeatable
    sparkle() {
      corner();
      const j = () => (Math.random() - 0.5) * 0.02;
      // the cone's axis: from the corner diagonally down across the screen,
      // a little away from the eye; two axes across it for the spiral
      const ax = _r.clone().multiplyScalar(1).addScaledVector(_u, -0.8).addScaledVector(_f, 0.35).normalize();
      const b1 = _f.clone().cross(ax).normalize(), b2 = ax.clone().cross(b1).normalize();
      for (let k = 0; k < nSpark; k++) {
        const i = (head + k) % sPool;
        sPos.setXYZ(i, _c.x + j(), _c.y + j(), _c.z + j());
        const v = 0.07 + Math.random() * 0.09;                  // along the axis, m/s
        const off = v * Math.tan(Math.random() * 0.42);          // off it: inside a cone of ~24°
        sVel.setXYZ(i, ax.x * v, ax.y * v, ax.z * v);
        sS1.setXYZ(i, b1.x * off, b1.y * off, b1.z * off);
        sS2.setXYZ(i, b2.x * off, b2.y * off, b2.z * off);
        sBirth.setX(i, now + Math.random() * 0.35);
        sSeed.setX(i, Math.random());
      }
      head = (head + nSpark) % sPool;
      sPos.needsUpdate = sVel.needsUpdate = sS1.needsUpdate = sS2.needsUpdate = sBirth.needsUpdate = sSeed.needsUpdate = true;
      sparkEnd = now + 0.35 + 3.0 + 0.1;
      sparkles.visible = true;
    },

    // the finale: target = { x, z, dir: [dx, dz], length } of the rose arch
    stream(target) {
      corner();
      const [dx, dz] = target.dir, l = Math.hypot(dx, dz) || 1;
      flowU.uE.value.set(target.x, 0, target.z);
      flowU.uDir.value.set(dx / l, 0, dz / l);
      flowU.uSide.value.set(-dz / l, 0, dx / l);
      flowU.uLen.value = target.length;
      flowU.uCorner0.value.copy(_c); flowU.uCorner.value.copy(_c);
      followEnd = now + EMIT + 0.1;                 // the last one is born by then
      seed(pGeo, nPetal);
      seed(dGeo, nDust);
      petals.visible = dust.visible = true;
    },

    update(dt, time) {
      now = time;
      shared.uTime.value = time;
      shared.uViewH.value = innerHeight * quality.pixelRatio;
      if (sparkles.visible && time > sparkEnd) sparkles.visible = false;
      if (time < followEnd) { corner(); flowU.uCorner.value.copy(_c); }   // uniform only, no buffers
    },

    dispose() {
      for (const o of [sparkles, petals, dust]) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
      map.dispose();
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
