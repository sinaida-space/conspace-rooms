import * as THREE from 'three';
import { roundedBox } from './geom.js';
import { buildDoorway, buildLightRays } from './doorway.js';

// ── conspace-rooms · stairwell.js ───────────────────────────────────────────
// The metal door in the fear stage (#34): a solid steel leaf set into an
// ordinary wall, on the route to the first portal. Every time the visitor
// passes it gives way, holds long enough to show what is behind it — a ruined
// stairwell — and shuts again, while light in the tone of the photograph
// pours out into the corridor, the way it does from the presence doors.
//
// The door is doorway.js's own painted panel door, so it opens the way the
// other doors do: the leaf swings out toward the visitor.
//
// What is behind it is a lie the wall tells: nothing can be cut into
// world.js's own geometry from here, so the opening is one quad drawn over the
// wall with depth-testing off. Its shader shows the photograph edge to edge,
// slides and pushes it against the visitor's position (see ROOM_FRAG), and
// nothing is drawn in front of it but light.

const DOOR_W = 0.9, DOOR_H = 2.05, FRAME = 0.08, WALL_T = 0.2; // matches doorway.js's presence door
const ROOM_HW = 1.6;            // half width of the room behind the door
const ROOM_D = 3.4;             // its depth
const ROOM_FLOOR = -1.0;        // its floor sits below the doorstep: a stairwell drops away
const DEFAULT_TINT = [0.42, 0.34, 0.24];   // a dim tungsten until the photograph says otherwise

const box = (w, h, d) => roundedBox(w, h, d, Math.min(0.04, Math.min(w, h, d) * 0.3));

const ROOM_VERT = /* glsl */`
varying vec3 vP;
void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
// The doorway looks into a real 3D room, drawn by ray-casting the eye through
// the opening into a box (interior mapping). One photograph covers all five
// faces: it is the far wall as it is, and it carries on across the side
// walls, the floor and the ceiling as a mirror image folded at each corner at
// the same scale, so no face is stretched and no seam shows. Because the ray
// really starts at the eye, moving past the door slides the room behind the
// frame exactly as a real room would.
const ROOM_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uEye;
uniform float uK, uTime, uGain, uRoomH;
varying vec3 vP;
const float HW = ${ROOM_HW.toFixed(2)};
const float RD = ${ROOM_D.toFixed(2)};
const float FY = ${ROOM_FLOOR.toFixed(2)};
const float DW = ${DOOR_W.toFixed(3)}, DH = ${DOOR_H.toFixed(3)};
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
vec3 pic(vec2 uv){                                       // the photograph, mirror-folded past its edges
  uv = 1.0 - abs(1.0 - mod(uv, 2.0));
  return texture2D(uMap, uv).rgb;
}
void main(){
  vec3 rd = normalize(vP - uEye);
  if (rd.z >= -0.001) discard;
  float tx = (rd.x > 0.0 ? HW - vP.x : -HW - vP.x) / rd.x;
  float ty = (rd.y > 0.0 ? FY + uRoomH - vP.y : FY - vP.y) / rd.y;
  float tz = (-RD - vP.z) / rd.z;
  float t = min(tz, min(tx, ty));
  vec3 hit = vP + rd * t;
  float dz = hit.z + RD;                                 // metres from the far wall toward the door
  vec2 back = vec2((hit.x + HW) / (2.0 * HW), (hit.y - FY) / uRoomH);
  vec2 uv;
  if (t == tz)      uv = back;
  else if (t == tx) uv = vec2(rd.x > 0.0 ? 1.0 + dz / (2.0 * HW) : -dz / (2.0 * HW), back.y);
  else              uv = vec2(back.x, rd.y > 0.0 ? 1.0 + dz / uRoomH : -dz / uRoomH);
  vec3 col = pic(uv);
  col = pow(col, vec3(0.8)) * uGain;                     // the photographs are dark: expose each to a readable level
  col *= mix(0.6, 1.0, smoothstep(0.0, 0.5, dz / RD));   // a little shade toward the door, for depth
  float q = min(min(vP.x / DW + 0.5, 0.5 - vP.x / DW) * 6.0, 1.0);
  col *= mix(0.65, 1.0, q);                              // the reveal's own shadow at the frame

  // ── the nightmare: one bare bulb swinging on its flex (the same one that
  // lights the door's edges, stairwell.js tick), the picture drained toward
  // the hospital's sick green and the bulb's tungsten, fog lying low and
  // thick at the threshold, heavy crawling grain
  float sw = sin(uTime * 1.7) * 0.35;
  vec3 bulb = vec3(sw, 2.25 - abs(sw) * 0.15, -0.9);
  float flick = 0.85 + 0.15 * sin(uTime * 23.0) * sin(uTime * 7.1);
  vec3 toB = bulb - hit; float db = length(toB);
  float lb = flick * (0.6 + 5.0 / (1.0 + db * db));    // the room is lit by it and nothing else
  float grey = dot(col, vec3(0.3, 0.55, 0.15));
  col = mix(vec3(grey), col, 0.35) * vec3(0.85, 1.0, 0.82) * mix(vec3(1.0), vec3(1.25, 1.0, 0.7), 0.5) * lb;
  col = smoothstep(0.0, 0.62, col);              // hard contrast: the steps and the windows cut out of the dark
  // fog: denser the further the ray goes and the lower it runs, drifting
  float fn = n2(hit.xz * 1.3 + vec2(uTime * 0.12, -uTime * 0.07)) * 0.6 + n2(hit.xy * 2.1 - uTime * 0.05) * 0.4;
  float low = smoothstep(1.2, -0.8, hit.y);
  float fog = 1.0 - exp(-t * (0.08 + 0.35 * low) * (0.6 + 0.8 * fn));
  float nearB = 1.0 / (1.0 + 4.0 * dot(bulb - (vP + rd * min(t, 1.5)), bulb - (vP + rd * min(t, 1.5))));   // the haze glows round the bulb
  vec3 fogC = vec3(0.07, 0.085, 0.065) * (0.6 + 0.8 * fn) + vec3(1.0, 0.75, 0.45) * nearB * 0.9 * flick;
  col = mix(col, fogC, clamp(fog, 0.0, 0.8));
  // the bulb itself, a hot point where the ray passes close to it
  vec3 cb = bulb - vP; float along = clamp(dot(cb, rd), 0.0, t);
  float miss = length(cb - rd * along);
  col += vec3(1.0, 0.82, 0.55) * flick * (exp(-miss * miss * 900.0) * 3.0 + exp(-miss * miss * 40.0) * 0.35);
  // and a veil of it right in the opening, thickest along the frame
  float veil = (1.0 - q) * 0.45 + 0.3 * fn * smoothstep(0.9, -0.2, vP.y);
  col = mix(col, fogC * 1.6 + vec3(0.05, 0.055, 0.045), clamp(veil, 0.0, 0.7));
  // grain, heavy and alive: every frame another
  vec2 gp = floor(gl_FragCoord.xy * 0.75);
  float gr = fract(sin(dot(gp + floor(uTime * 24.0) * vec2(17.0, 31.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += gr * 0.3 * (0.35 + grey);
  col *= 1.0 - 0.35 * smoothstep(0.35, 0.7, length((vP.xy - vec2(0.0, DH * 0.5)) / vec2(DW, DH)));
  gl_FragColor = vec4(max(col, 0.0), uK);
  #include <colorspace_fragment>
}
`;

// ── the metal door's skin ───────────────────────────────────────────────────
// An ordinary steel stairwell door, painted over and over in a dull
// brown-grey: the paint is rough to the eye (grain in every pixel), blistered,
// rusting through at the handle and along the bottom, scratched. No plaque.
function metalTex(w, h, { leaf }) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = leaf ? 'rgb(122,116,106)' : 'rgb(96,92,84)';
  g.fillRect(0, 0, w, h);
  const blot = (x, y, r, col) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  };
  for (let i = 0; i < 60; i++) blot(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, `rgba(${Math.random() < 0.5 ? '40,34,28' : '140,132,118'},0.12)`);   // uneven coats
  if (leaf) {
    // the pressed panel: a shallow rectangle stamped into the sheet
    const m = 26;
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(m, m, w - 2 * m, h - 2 * m);
    g.strokeStyle = 'rgba(200,190,170,0.18)'; g.lineWidth = 2; g.strokeRect(m + 3, m + 3, w - 2 * m, h - 2 * m);
    const hy = h * (1 - 1.0 / DOOR_H), hx = w * 0.88;   // the handle, 1 m up, near the free edge
    blot(hx, hy, 70, 'rgba(20,14,8,0.45)');             // grease where hands push
    for (let i = 0; i < 14; i++) blot(hx + (Math.random() - 0.5) * 60, hy + (Math.random() - 0.5) * 80, 6 + Math.random() * 16, 'rgba(120,58,22,0.55)');
  }
  // rust climbing from the floor in ragged tongues
  for (let x = 0; x < w; x += 3) {
    const top = h - (leaf ? 30 : 60) - Math.pow(Math.random(), 3) * (leaf ? 90 : 160);
    const gr = g.createLinearGradient(0, top, 0, h);
    gr.addColorStop(0, 'rgba(110,52,20,0)'); gr.addColorStop(0.4, 'rgba(110,52,20,0.5)'); gr.addColorStop(1, 'rgba(70,32,14,0.85)');
    g.fillStyle = gr; g.fillRect(x, top, 3, h - top);
  }
  for (let i = 0; i < 40; i++) blot(Math.random() * w, Math.random() * h, 3 + Math.random() * 10, 'rgba(120,60,24,0.5)');   // rust pinholes
  // blisters: a lit upper rim, a shadowed lower one
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 1.5 + Math.random() * 4;
    g.fillStyle = 'rgba(220,210,190,0.25)'; g.beginPath(); g.arc(x, y - r * 0.3, r, Math.PI, 2 * Math.PI); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(x, y + r * 0.3, r, 0, Math.PI); g.fill();
  }
  g.strokeStyle = 'rgba(210,200,180,0.22)'; g.lineWidth = 1;   // scratches through to bare metal
  for (let i = 0; i < 30; i++) { const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 14); g.stroke(); }
  // grain in every pixel: the paint reads rough even from the corridor
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 38 + (Math.random() < 0.02 ? -40 : 0);
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Lit per facet: the corridor's tubes from above and in front, every face of
// the leaf and the frame catching it at its own angle, the paint's grain
// raised into relief from the texture itself. uBulb: a light behind the door
// (the stairwell's own), felt only while the door stands open.
const METAL_VERT = /* glsl */`
#include <fog_pars_vertex>
varying vec2 vUv; varying vec3 vN, vW;
void main(){
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const METAL_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
uniform vec3 uBulb, uBulbCol;
uniform float uBulbK;
varying vec2 vUv; varying vec3 vN, vW;
void main(){
  vec3 tex = texture2D(uMap, vUv).rgb;
  // relief from the paint itself: brightness read as height
  float h = dot(tex, vec3(0.33));
  vec3 N = normalize(vN);
  vec3 dpx = dFdx(vW), dpy = dFdy(vW);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2) * 0.004;   // 4 mm of relief at full contrast
  N = normalize(abs(det) * N - grad);
  vec3 key = normalize(vec3(0.35, 0.9, 0.45));
  float lit = (0.55 + 0.9 * max(dot(N, key), 0.0) + 0.3 * max(dot(N, normalize(vec3(-0.6, 0.2, -0.3))), 0.0)) * 1.5;   // the hospital's tubes are bright
  vec3 col = tex * lit;
  vec3 toB = uBulb - vW; float db = length(toB);
  col += tex * uBulbCol * uBulbK * max(dot(N, toB / db), 0.0) * 2.2 / (1.0 + db * db);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
function metalMat(map) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uMap: { value: map }, uBulb: { value: new THREE.Vector3() }, uBulbCol: { value: new THREE.Color(1, 0.85, 0.6) }, uBulbK: { value: 0 },
    }]),
    vertexShader: METAL_VERT, fragmentShader: METAL_FRAG, fog: true,
  });
}

// Build the door and the picture behind it. atmo: the world's material kit
// (kept for the caller's signature). imgUrl: one of
// assets/stairs/stairs_1..5.webp, chosen by the caller from the visit's seed.
// Local +Z points out of the wall, into the corridor.
export function buildStairwell(atmo, imgUrl) {
  const g = new THREE.Group();   // always visible: the door itself is never a secret

  // the door itself is the same painted panel door as every other door in the
  // hospital (doorway.js): architrave, lever, peephole (no plaque), and a leaf that
  // swings toward the visitor. Only the doorway's own wall is left out: the
  // real wall is already there.
  const dw = buildDoorway(DOOR_W + 2 * FRAME, new THREE.MeshBasicMaterial(), 0, '');
  for (const m of dw.group.children.filter(o => o.userData.keepMaterial)) dw.group.remove(m);
  dw.group.position.z = 0.02;
  g.add(dw.group);
  const pivot = dw.pivot, door = dw.door;
  // reskin as plain rough steel, lit face by face
  const leafSkin = metalMat(metalTex(256, 584, { leaf: true }));
  const frameSkin = metalMat(metalTex(64, 512, { leaf: false }));
  const skins = [leafSkin, frameSkin];
  const bulbAt = new THREE.Vector3();
  door.material.map?.dispose(); door.material.dispose(); door.material = leafSkin;
  for (const m of dw.group.children) if (m.isMesh) { m.material.map?.dispose(); m.material.dispose(); m.material = frameSkin; }
  for (const m of pivot.children) if (m.isMesh && m !== door) m.material.color?.setRGB(0.32, 0.3, 0.28);   // handle and peephole: dark worn steel

  // the room behind, one quad exactly the size of the opening. Vertices are
  // in the door group's own frame so the shader can ray-cast from the eye.
  const roomMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false,
    uniforms: {
      uMap: { value: new THREE.DataTexture(new Uint8Array([10, 14, 18, 255]), 1, 1) },
      uEye: { value: new THREE.Vector3(0, 1.5, 3) }, uTint: { value: new THREE.Color(...DEFAULT_TINT) },
      uK: { value: 0 }, uTime: { value: 0 }, uRoomH: { value: 2 * ROOM_HW / 0.75 }, uGain: { value: 1.6 },
    },
    vertexShader: ROOM_VERT, fragmentShader: ROOM_FRAG,
  });
  roomMat.uniforms.uMap.value.needsUpdate = true;
  const room = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, DOOR_H).translate(0, DOOR_H / 2, 0.004), roomMat);
  room.visible = false;          // only the room fades with the door; the door itself never does
  g.add(room);

  // a soft cloud of that light on the wall around the frame: a big additive
  // haze, densest at the door and thinning outward, drifting slowly. It sits
  // just proud of the wall and depth-tested, so the frame and leaf stay solid.
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    uniforms: { uK: { value: 0 }, uTime: { value: 0 }, uTint: { value: new THREE.Color(...DEFAULT_TINT) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uK, uTime; uniform vec3 uTint; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 d = (vUv - 0.5) * vec2(1.0, 1.0);
        float r = length(d * vec2(1.0, 0.8)) * 2.0;        // 0 at the door, 1 at the plane's edge
        float cloud = 0.6 * n(vUv * 4.0 + vec2(uTime * 0.05, -uTime * 0.03)) + 0.4 * n(vUv * 9.0 - vec2(uTime * 0.04, 0.0));
        float a = smoothstep(1.0, 0.0, r);
        a = a * a * (0.45 + 0.9 * cloud);
        gl_FragColor = vec4(uTint * a * uK * 0.5, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const cloud = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.8), cloudMat);
  cloud.position.set(0, DOOR_H / 2 + 0.1, 0.035);
  cloud.renderOrder = 4;
  cloud.visible = false;
  g.add(cloud);

  // light from the doorway in the photograph's own tone: the shafts of a
  // presence door, recoloured. The gap itself is the room, so no white fill.
  const rays = buildLightRays(4.5, { gapK: 0, tint: DEFAULT_TINT });
  g.add(rays.group);

  // the photograph behind the door; it may be swapped between visits, so
  // every pass can open onto another stairwell. Loaded textures are kept.
  const cache = new Map();
  let want = null;
  const show = img => {
    roomMat.uniforms.uMap.value = img;
    roomMat.uniforms.uRoomH.value = 2 * ROOM_HW / (img.image.width / img.image.height);   // the far wall shows the whole photograph
    const c = img.userData.tint ??= photoTint(img.image);   // the photograph's light: its bright pixels' colour
    roomMat.uniforms.uGain.value = c.gain;
    roomMat.uniforms.uTint.value.setRGB(c[0], c[1], c[2]);
    // what pours out is the bulb's tungsten more than the photograph's tone, and dim
    const w = [0.3 * c[0] + 0.55, 0.3 * c[1] + 0.4, 0.3 * c[2] + 0.22].map(v => v * 0.6);
    rays.tint.set(w[0], w[1], w[2]);
    cloudMat.uniforms.uTint.value.setRGB(w[0], w[1], w[2]);
  };
  const placeholder = roomMat.uniforms.uMap.value;
  const setImage = url => {
    want = url;
    if (cache.has(url)) { show(cache.get(url)); return; }
    new THREE.TextureLoader().load(url, img => {
      img.colorSpace = THREE.SRGBColorSpace;
      cache.set(url, img);
      if (want === url) show(img);
    }, undefined, () => {}); // missing file: whatever shows now stays
  };
  if (imgUrl) setImage(imgUrl);

  return {
    group: g, pivot, door, rays, tint: rays.tint, skins,
    // k: 0 shut, 1 fully open/held. eye: the camera's world position, so the
    // room behind the door parallaxes against the visitor's movement.
    tick(dt, time, k, eye) {
      // a bare bulb swinging on its flex in the stairwell, just behind the
      // opening: it lights the frame and the leaf's edge from within, each
      // facet by turns
      const sw = Math.sin(time * 1.7) * 0.35, bulb = g.localToWorld(bulbAt.set(sw, 2.25 - Math.abs(sw) * 0.15, -0.9));
      for (const m of skins) { m.uniforms.uBulb.value.copy(bulb); m.uniforms.uBulbK.value = k * (0.85 + 0.15 * Math.sin(time * 23.0) * Math.sin(time * 7.1)); }
      const on = k > 0.002;
      room.visible = on;
      cloud.visible = on;
      rays.set(k, time);
      if (!on) return;
      cloudMat.uniforms.uK.value = k; cloudMat.uniforms.uTime.value = time;
      roomMat.uniforms.uK.value = Math.min(1, k * 1.6);
      roomMat.uniforms.uTime.value = time;
      if (eye) {                          // exaggerated a little sideways and swayed, so the depth reads even standing still
        const e = g.worldToLocal(roomMat.uniforms.uEye.value.copy(eye));
        e.x = e.x * 1.4 + Math.sin(time * 0.7) * 0.06;
        e.y = 1.5 + (e.y - 1.5) * 1.2;
      }
    },
    setImage,
    dispose() {
      g.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      placeholder.dispose();
      for (const img of cache.values()) img.dispose();
      for (const m of skins) m.uniforms.uMap.value.dispose();
      rays.dispose();
    },
  };
}

// The colour of a photograph's light: its brighter pixels averaged, lifted so
// the strongest channel is 0.95 (a tint for glow, not for shade).
function photoTint(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 24;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data;
    let r = 0, gg = 0, b = 0, w = 0, lum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 765, k = l * l * l;
      lum += l;
      r += d[i] * k; gg += d[i + 1] * k; b += d[i + 2] * k; w += k;
    }
    const gain = Math.min(6, Math.max(1.5, 0.34 / Math.max(lum / (d.length / 4), 0.02)));   // expose the mean to about a third
    if (w < 1e-6) return Object.assign([...DEFAULT_TINT], { gain });
    const m = Math.max(r, gg, b) / w;
    return Object.assign([0.95 * r / w / m, 0.95 * gg / w / m, 0.95 * b / w / m], { gain });
  } catch { return Object.assign([...DEFAULT_TINT], { gain: 2 }); }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
