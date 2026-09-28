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
const DEFAULT_TINT = [0.45, 0.72, 0.9];

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
  gl_FragColor = vec4(col, uK);
  #include <colorspace_fragment>
}
`;

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

  if (imgUrl) {
    new THREE.TextureLoader().load(imgUrl, img => {
      img.colorSpace = THREE.SRGBColorSpace;
      roomMat.uniforms.uMap.value.dispose();
      roomMat.uniforms.uMap.value = img;
      roomMat.uniforms.uRoomH.value = 2 * ROOM_HW / (img.image.width / img.image.height);   // the far wall shows the whole photograph
      const c = photoTint(img.image);                    // the photograph's light: its bright pixels' colour
      roomMat.uniforms.uGain.value = c.gain;
      roomMat.uniforms.uTint.value.setRGB(c[0], c[1], c[2]);
      rays.tint.set(c[0], c[1], c[2]);
      cloudMat.uniforms.uTint.value.setRGB(c[0], c[1], c[2]);
    }, undefined, () => {}); // missing file: the dark placeholder and the default tint stay
  }

  return {
    group: g, pivot, door, rays, tint: rays.tint,
    // k: 0 shut, 1 fully open/held. eye: the camera's world position, so the
    // room behind the door parallaxes against the visitor's movement.
    tick(dt, time, k, eye) {
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
    dispose() {
      g.traverse(o => { o.geometry?.dispose(); if (o.material?.uniforms?.uMap) o.material.uniforms.uMap.value.dispose(); o.material?.dispose(); });
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
