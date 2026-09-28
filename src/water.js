import * as THREE from 'three';
import { CEIL_H, CELL, solidAtGlobal } from './world.js';

// ── conspace-rooms · water.js ───────────────────────────────────────────────
// In the acceptance stage the floor goes under water. Puddles first, ankle
// deep once every work has been seen; the whole sheet breathes with a slow
// tide. Footsteps and drips from the ceiling send rings across it. One plane
// follows the visitor; on the high tier it mirrors the room through a half
// resolution pass, elsewhere it fakes the mirror with fog and lamp smears.
// The caustics the water throws on walls, floor and ceiling live in
// materials.js, driven by uWater (set here through atmo.setWater).

const TIDE_PERIOD = 10;        // seconds per breath of the tide
const RIPPLES = 12;            // rings alive at once (ring buffer)
const RING_SPEED = 0.6;        // m/s the ring front travels
const PLANE = 60;              // metres of water plane around the visitor

// The puddle mask: two octaves of value noise on an integer hash, so the
// shader and heightAt() agree to the bit (the float hash in materials.js
// would drift between GPU and JS). The wet threshold falls with progress,
// which the shaders read back from level / accept; so the rims creep a
// little in and out with the tide.
export const WATER_GLSL = /* glsl */`
float waterHash(vec2 c){
  highp uvec2 q = uvec2(ivec2(c));   // highp: a 16-bit int would wrap the hash on some phones
  highp uint h = q.x * 1597334677u ^ q.y * 3812015801u;
  h = (h ^ (h >> 16)) * 2246822519u;
  h ^= h >> 13;
  return float(h >> 8) / 16777216.0;
}
float waterNoise1(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = waterHash(i), b = waterHash(i + vec2(1.0, 0.0));
  float c = waterHash(i + vec2(0.0, 1.0)), d = waterHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float waterNoise(vec2 xz){ return waterNoise1(xz * 0.3) * 0.65 + waterNoise1(xz * 0.8 + 17.0) * 0.35; }
// progress 0..1 recovered from the level (0.03 at entry, 0.15 at the end)
float waterThreshold(vec4 w){
  float prog = clamp((w.x / max(w.y, 1e-3) - 0.03) / 0.12, 0.0, 1.0);
  return mix(0.62, -0.1, prog);
}
// 1 under standing water, 0 on dry stone
float waterMask(vec2 xz, vec4 w){
  float thr = waterThreshold(w);
  return smoothstep(thr, thr + 0.06, waterNoise(xz));
}
// a little wider than the water: the damp rim round every puddle
float waterDamp(vec2 xz, vec4 w){
  float thr = waterThreshold(w);
  return smoothstep(thr - 0.07, thr + 0.01, waterNoise(xz));
}
`;

// the same noise in JS (Math.imul wraps like uint multiplication)
function waterHash(ix, iz) {
  let h = (Math.imul(ix, 1597334677) ^ Math.imul(iz, 3812015801 | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519 | 0) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return (h >>> 8) / 16777216;
}
function waterNoise1(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = waterHash(ix, iz), b = waterHash(ix + 1, iz), c = waterHash(ix, iz + 1), d = waterHash(ix + 1, iz + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uz;
}
const waterNoise = (x, z) => waterNoise1(x * 0.3, z * 0.3) * 0.65 + waterNoise1(x * 0.8 + 17, z * 0.8 + 17) * 0.35;
const smooth = x => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
uniform mat4 uTexMatrix;
varying vec3 vWorldPos;
varying vec4 vMirror;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vMirror = uTexMatrix * wp;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform vec4  uWater;              // level, accept, phase, calm (as the world shaders get it)
uniform float uTime;
uniform vec4  uRipples[${RIPPLES}];   // x, z, start time, strength
uniform vec3  uFinale;             // rose arch xz, 1 when it stands: the water round it goes still
uniform vec4  uHaze[6];            // the fixtures in sight (materials.js): xz of each panel, w = strength
uniform sampler2D uMirror;
uniform float uMirrorOn;
varying vec3 vWorldPos;
varying vec4 vMirror;
${WATER_GLSL}

#define LIGHT_ACC vec3(0.92, 0.90, 0.84)

// slope of the surface: a few slow, tiny directional swells plus the rings
vec2 surfaceSlope(vec2 p){
  float calm = uWater.w;
  float still = uFinale.z > 0.5 ? smoothstep(4.0, 6.0, distance(p, uFinale.xy)) : 1.0;   // the mirror under the arch is still
  float t = uTime;
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6)   * 0.010 * cos(dot(vec2(0.8, 0.6), p) * 3.1 + t * 0.9);
  g += vec2(-0.5, 0.87) * 0.008 * cos(dot(vec2(-0.5, 0.87), p) * 4.7 + t * 1.3);
  g += vec2(0.2, -0.98) * 0.006 * cos(dot(vec2(0.2, -0.98), p) * 7.3 + t * 1.7);
  g += vec2(-0.93, -0.37) * 0.004 * cos(dot(vec2(-0.93, -0.37), p) * 11.0 + t * 2.2);
  g *= 1.0 - 0.85 * calm;
  vec2 r = vec2(0.0);
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 rp = uRipples[i];
    float age = t - rp.z;
    if (rp.w <= 0.0 || age < 0.0 || age > 3.5) continue;
    vec2 d = p - rp.xy;
    float dist = length(d);
    float x = dist - age * ${RING_SPEED.toFixed(2)};        // metres behind (−) or ahead (+) of the front
    if (abs(x) > 0.45) continue;
    float amp = rp.w * exp(-age * 1.1) * exp(-x * x * 18.0) * smoothstep(0.0, 0.15, dist);
    r += d / max(dist, 1e-3) * amp * cos(x * 26.0) * 0.4;
  }
  r *= 1.0 - 0.5 * calm;
  return (g + r) * still;
}

void main(){
  vec2 p = vWorldPos.xz;
  float water = waterMask(p, uWater);
  float damp = waterDamp(p, uWater);
  if (damp < 0.004) discard;
  float rim = max(damp - water, 0.0);

  vec2 s = surfaceSlope(p);
  vec3 N = normalize(vec3(-s.x, 1.0, -s.y));
  vec3 V = normalize(cameraPosition - vWorldPos);
  float cosT = max(dot(N, V), 0.0);
  float F = min(0.02 + 0.98 * pow(1.0 - cosT, 5.0), 0.9);   // Schlick, water

  #ifdef USE_FOG
    vec3 fogC = fogColor;
  #else
    vec3 fogC = vec3(0.64, 0.67, 0.64);
  #endif

  // what the surface mirrors
  vec3 R = reflect(-V, N);
  vec3 refl;
  if (uMirrorOn > 0.5) {
    vec4 mc = vMirror;
    mc.xy += s * 0.9 * mc.w;                                // ripples bend the mirror
    refl = texture2DProj(uMirror, mc).rgb;
  } else {
    // fake: the milky fog, brighter looking up, and each lamp in sight as a
    // soft upright smear, the way a panel stretches on moving water
    refl = fogC * mix(1.02, 1.3, clamp(R.y, 0.0, 1.0));
    vec3 I = -V + vec3(s.x, 0.0, s.y) * 1.6;
    for (int i = 0; i < 6; i++) {
      if (uHaze[i].w <= 0.0) continue;
      vec3 img = vec3(uHaze[i].x, 2.0 * uWater.x - (${CEIL_H.toFixed(2)} - 0.05), uHaze[i].z);   // the panel seen below the surface
      vec3 D = normalize(img - cameraPosition);
      vec3 e = normalize(I) - D;
      vec3 side = normalize(cross(D, vec3(0.0, 1.0, 0.0)));
      float eh = dot(e, side), ev = e.y;
      refl += LIGHT_ACC * min(uHaze[i].w, 1.0) * 0.5 * exp(-eh * eh * 900.0 - ev * ev * 30.0);
    }
  }

  // narrow soft glint of the pale panels overhead
  vec3 spec = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    if (uHaze[i].w <= 0.0) continue;
    vec3 L = normalize(vec3(uHaze[i].x, ${CEIL_H.toFixed(2)} - 0.05, uHaze[i].z) - vWorldPos);
    spec += LIGHT_ACC * min(uHaze[i].w, 1.0) * pow(max(dot(N, normalize(L + V)), 0.0), 380.0) * 0.9;
  }

  // body: shallow water shows the floor, deeper takes a faint grey-green;
  // the stone under it and in the damp rim goes darker and cooler
  float depth = uWater.x * water;
  float absorb = 1.0 - exp(-depth * 14.0);
  vec3 bodyCol = mix(fogC * vec3(0.3, 0.34, 0.37), fogC * vec3(0.34, 0.42, 0.37), absorb);
  float aBody = water * (0.28 + 0.34 * absorb) + rim * 0.16;
  bodyCol *= 1.0 + dot(s, vec2(0.6, 0.8)) * 4.0;            // the swell catches the light on one side: rings read even on milky water
  float aRefl = (0.22 + 0.78 * F) * (water + rim * 0.35) * (1.0 - aBody);   // wet stone is dark: even looking down it mirrors
  float a = aBody + aRefl;
  vec3 col = bodyCol * aBody + refl * aRefl + spec * water;  // premultiplied: the floor keeps (1 − a)
  a *= uWater.y; col *= uWater.y;

  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogF = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    col = mix(col, fogColor * a, fogF);
  #endif
  gl_FragColor = vec4(col, a);
}
`;

export function createWater({ scene, renderer, camera, quality, stage, atmo }) {
  const uniforms = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
    uWater: { value: new THREE.Vector4() },
    uTime: { value: 0 },
    uRipples: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
    uFinale: { value: new THREE.Vector3() },
    uHaze: atmo?.haze ?? { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -100, 0, 0)) },   // shared with the world
    uMirror: { value: null },
    uMirrorOn: { value: 0 },
    uTexMatrix: { value: new THREE.Matrix4() },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, premultipliedAlpha: true, depthWrite: false, fog: true,
  });
  const geo = new THREE.PlaneGeometry(PLANE, PLANE, 2, 2).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;          // first of the see-through things: dust and petals draw over it
  mesh.visible = false;
  scene.add(mesh);

  // a falling drop: a thin sprite from the ceiling to the surface
  const drop = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xe6ece8, transparent: true, opacity: 0.75, depthWrite: false, fog: true }));
  drop.scale.set(0.012, 0.09, 1);
  drop.visible = false;
  scene.add(drop);
  let dropT = -1, dropX = 0, dropZ = 0, nextDrip = 3 + Math.random() * 3;

  // mirror (tier 2 only)
  let rt = null;
  const mirrorCam = new THREE.PerspectiveCamera();
  const size = new THREE.Vector2();
  const tmpV = new THREE.Vector3(), tmpT = new THREE.Vector3(), tmpUp = new THREE.Vector3();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const dropMirror = () => {
    if (rt) { rt.dispose(); rt = null; }
    uniforms.uMirror.value = null;
    uniforms.uMirrorOn.value = 0;
  };

  let head = 0, phase = 0, stillFor = 0, prog = 0;
  const api = {
    level: 0, tide: 0, calm: 0,
    heightAt(x, z) {
      if (api.level <= 0.001) return null;
      const w = uniforms.uWater.value;
      const p = Math.max(0, Math.min(1, (w.x / Math.max(w.y, 1e-3) - 0.03) / 0.12));
      const thr = 0.62 + (-0.1 - 0.62) * p;
      return waterNoise(x, z) > thr + 0.03 ? api.level : null;   // the middle of the rim
    },
    addRipple(x, z, strength = 1) {
      if (!mesh.visible) return;
      uniforms.uRipples.value[head].set(x, z, uniforms.uTime.value, Math.max(0, Math.min(1.5, strength)));
      head = (head + 1) % RIPPLES;
    },

    update(dt, elapsed, player, soul, audio) {
      const accept = stage.weights().accept;
      api.tide = Math.sin(elapsed * Math.PI * 2 / TIDE_PERIOD);
      const target = soul && soul.total ? soul.seen.size / soul.total : 0;
      prog += (target - prog) * Math.min(1, dt * 0.5);          // a newly seen work raises the water slowly
      api.level = accept < 0.001 ? 0 : (0.03 + 0.12 * smooth(prog)) * accept + 0.02 * api.tide * accept;
      // calm: stand still ~2 s and the surface settles; walking breaks it quickly
      const speed = player ? player.vel.length() : 0;
      stillFor = speed < 0.05 ? stillFor + dt : 0;
      api.calm = stillFor > 0 ? Math.min(1, api.calm + dt / 2) : Math.max(0, api.calm - dt * 2.5);
      phase += dt * (1 - 0.6 * api.calm);                        // caustics slow down on still water

      uniforms.uWater.value.set(api.level, accept, phase, api.calm);
      uniforms.uTime.value = elapsed;
      atmo?.setWater?.(api.level, accept, phase, api.calm);
      audio?.setWater?.({ level: api.level, tide: api.tide, calm: api.calm });

      mesh.visible = accept >= 0.001;
      if (!mesh.visible) { drop.visible = false; dropT = -1; if (rt) dropMirror(); return; }
      mesh.position.set(Math.round(camera.position.x), api.level, Math.round(camera.position.z));
      const f = soul?.finale?.spot;
      if (f) uniforms.uFinale.value.set(f.x, f.z, 1); else uniforms.uFinale.value.z = 0;

      // drips: only in the stage itself, only once there is water to land in
      if (dropT >= 0) {
        dropT += dt / 0.6;
        const y = CEIL_H - 0.05 - (CEIL_H - api.level) * dropT * dropT;   // falling, accelerating
        drop.position.set(dropX, y, dropZ);
        if (dropT >= 1) {
          drop.visible = false; dropT = -1;
          api.addRipple(dropX, dropZ, 0.6);
          const dx = dropX - camera.position.x, dz = dropZ - camera.position.z, dist = Math.hypot(dx, dz);
          audio?.drip?.(dx / (dist || 1), dz / (dist || 1), dist);
        }
      } else if (stage.stage === 2 && api.level > 0.01 && (nextDrip -= dt) <= 0) {
        nextDrip = 2.5 + Math.random() * 3.5;
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
          const x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r;
          if (solidAtGlobal(Math.floor(x / CELL), Math.floor(z / CELL)) || api.heightAt(x, z) === null) continue;
          dropX = x; dropZ = z; dropT = 0;
          drop.position.set(x, CEIL_H - 0.05, z);
          drop.visible = true;
          break;
        }
      }
    },

    // the planar mirror, rendered just before the frame itself
    beforeRender() {
      if (quality.tier < 2 || !mesh.visible) { if (rt) dropMirror(); return; }
      renderer.getDrawingBufferSize(size);
      const w = Math.max(1, Math.floor(size.x / 2)), h = Math.max(1, Math.floor(size.y / 2));
      if (!rt) {
        rt = new THREE.WebGLRenderTarget(w, h);
        rt.texture.colorSpace = THREE.SRGBColorSpace;
        rt.texture.generateMipmaps = false;
      } else if (rt.width !== w || rt.height !== h) rt.setSize(w, h);

      // the camera reflected across y = level
      const L = api.level;
      camera.updateMatrixWorld();
      tmpV.setFromMatrixPosition(camera.matrixWorld);
      mirrorCam.position.set(tmpV.x, 2 * L - tmpV.y, tmpV.z);
      camera.getWorldDirection(tmpT).add(tmpV);
      tmpT.y = 2 * L - tmpT.y;
      tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      tmpUp.y = -tmpUp.y;
      mirrorCam.up.copy(tmpUp);
      mirrorCam.lookAt(tmpT);
      mirrorCam.near = camera.near; mirrorCam.far = camera.far;
      mirrorCam.aspect = camera.aspect; mirrorCam.fov = camera.fov;
      mirrorCam.layers.mask = camera.layers.mask;
      mirrorCam.updateProjectionMatrix();
      mirrorCam.updateMatrixWorld();
      uniforms.uTexMatrix.value.copy(bias).multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);

      // oblique near plane on the surface: nothing below the water renders into the mirror
      plane.set(tmpV.set(0, 1, 0), -L).applyMatrix4(mirrorCam.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const P = mirrorCam.projectionMatrix.elements;
      q.set((Math.sign(clip.x) + P[8]) / P[0], (Math.sign(clip.y) + P[9]) / P[5], -1, (1 + P[10]) / P[14]);
      clip.multiplyScalar(2 / clip.dot(q));
      P[2] = clip.x; P[6] = clip.y; P[10] = clip.z + 1 - 0.003; P[14] = clip.w;
      mirrorCam.projectionMatrixInverse.copy(mirrorCam.projectionMatrix).invert();

      const prevTarget = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate;
      mesh.visible = false; uniforms.uMirrorOn.value = 0;
      renderer.shadowMap.autoUpdate = false;                   // the shadows of this frame come with the main pass
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, mirrorCam);
      renderer.setRenderTarget(prevTarget);
      renderer.shadowMap.autoUpdate = prevShadow;
      mesh.visible = true;
      uniforms.uMirror.value = rt.texture;
      uniforms.uMirrorOn.value = 1;
    },

    dispose() {
      dropMirror();
      scene.remove(mesh, drop);
      geo.dispose(); mat.dispose(); drop.material.dispose();
    },
  };
  return api;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
