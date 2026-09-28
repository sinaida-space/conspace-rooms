// Post-processing pass: RGB delay tied to speed, scanlines and noise, glitch
// bursts on demand. Init-only — not auto-started; call render() from the
// app loop once wired up.
import * as THREE from 'three';

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tWater;   // the water, drawn alone and premultiplied (water.js), laid over the scene
uniform float uWaterOn;
uniform float uTime, uShift, uGlitch;
uniform float uCrt;    // how much television: 1 in the dark stages, a quarter in the light
uniform vec3 uBloom;   // bloom tint: phosphor green in the dark stages, warm white in the light
// soft edges for whatever is not drawn yet (sketches, ?edge=a|b|c):
// 1 dusty fog dissolve by depth, 2 dreamy periphery blur, 3 soft silhouettes
uniform int uEdge;
uniform sampler2D tDepth;
uniform vec2 uNearFar;
uniform vec3 uFogCol;
uniform float uFogFar;  // metres where the scene's fog is all but closed
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 frame(vec2 uv){
  vec3 c = texture2D(tScene, uv).rgb;
  if (uWaterOn > 0.5) { vec4 w = texture2D(tWater, uv); c = w.rgb + c * (1.0 - w.a); }
  return c;
}
// metres from the eye; the empty background counts as infinitely far
float viewZ(vec2 uv){
  float d = texture2D(tDepth, uv).r;
  if (d >= 0.99999) return 1e4;
  float z = d * 2.0 - 1.0, n = uNearFar.x, f = uNearFar.y;
  return 2.0 * n * f / (f + n - z * (f - n));
}
vec3 ring(vec2 uv, float r){
  vec3 a = vec3(0.0);
  for (int i = 0; i < 8; i++) { float t = float(i) * 0.7854 + 0.39; a += frame(uv + vec2(cos(t), sin(t)) * r); }
  return a / 8.0;
}
void main(){
  vec2 uv = vUv;
  // glitch: horizontal band displacement
  if (uGlitch > 0.01) {
    float band = step(0.92 - uGlitch*0.25, hash(vec2(floor(uv.y*36.0), floor(uTime*24.0))));
    uv.x += band * (hash(vec2(floor(uv.y*36.0), floor(uTime*24.0)+1.0)) - 0.5) * 0.12 * uGlitch;
  }
  // rgb delay
  float s = uShift + uGlitch*0.01;
  vec3 c;
  c.r = frame(uv + vec2(s, 0.0)).r;
  c.g = frame(uv).g;
  c.b = frame(uv - vec2(s, 0.0)).b;

  // cheap phosphor bloom: sample a small ring around this texel, keep only
  // the brightest neighbours, add back tinted green — a poor-man's
  // threshold+blur bloom in a single pass (no extra render targets needed)
  vec3 glow = vec3(0.0);
  float px = 1.0 / 720.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854; // 2*PI/8
    vec2 o = vec2(cos(a), sin(a)) * px * 3.0;
    vec3 samp = frame(uv + o);
    float bright = max(samp.r, max(samp.g, samp.b));
    glow += samp * smoothstep(0.55, 1.0, bright);
  }
  glow /= 8.0;
  c += glow * uBloom * 0.55;

  // ?edge=abc: the three side by side, a third of the frame each
  int edge = uEdge == 4 ? (vUv.x < 0.3333 ? 1 : vUv.x < 0.6667 ? 2 : 3) : uEdge;
  if (edge == 1) {
    // A: far things dissolve into the fog as grain, never as a line: the
    // threshold itself is noisy and crawls, so the end of a corridor is dust
    float z = viewZ(vUv);
    float g = hash(floor(vUv * vec2(640.0, 400.0)) + floor(uTime * 12.0));
    float k = smoothstep(uFogFar * 0.35, uFogFar * 0.8, z * (0.8 + 0.4 * g));
    c = mix(c, uFogCol, k);
  } else if (edge == 2) {
    // B: peripheral vision in a dream: the frame softens toward its edges and
    // far away, the middle stays sharp
    float z = viewZ(vUv);
    float r = length((vUv - 0.5) * vec2(1.6, 1.0));
    float amt = smoothstep(0.25, 0.85, r) + 0.6 * smoothstep(uFogFar * 0.3, uFogFar * 0.8, z);
    vec3 b = (ring(uv, 0.004 * amt) + ring(uv, 0.009 * amt)) * 0.5;
    c = mix(c, b, clamp(amt, 0.0, 1.0));
    c = mix(c, uFogCol, 0.35 * smoothstep(uFogFar * 0.4, uFogFar, z));
  } else if (edge == 3) {
    // C: every silhouette melts a little: where depth jumps, the edge is
    // blurred across; far things lose their outlines altogether
    float z = viewZ(vUv);
    float px = 1.0 / 540.0, jump = 0.0;
    for (int i = 0; i < 4; i++) { float t = float(i) * 1.5708; jump = max(jump, abs(viewZ(vUv + vec2(cos(t), sin(t)) * px * 3.0) - z) / max(z, 0.5)); }
    float far = smoothstep(uFogFar * 0.3, uFogFar * 0.8, z);
    float amt = clamp(smoothstep(0.05, 0.4, jump) + far, 0.0, 1.0);
    c = mix(c, ring(uv, px * (3.0 + 5.0 * far)), amt * 0.85);
    c = mix(c, uFogCol, 0.5 * far * far);
  }

  if (uEdge == 4 && (abs(vUv.x - 0.3333) < 0.0012 || abs(vUv.x - 0.6667) < 0.0012)) c = vec3(0.9, 0.1, 0.1);

  // scanlines + noise
  c *= mix(1.0, 0.90 + 0.10 * sin(uv.y * 900.0 + uTime * 8.0), uCrt);
  c += (hash(uv * vec2(1441.0, 907.0) + fract(uTime)) - 0.5) * 0.055 * uCrt;
  // vignette
  float v = length(uv - 0.5);
  c *= 1.0 - v*v*0.55;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createPost(renderer, quality) {
  let rt = null;
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    tScene: { value: null }, tWater: { value: null }, uWaterOn: { value: 0 },
    uTime: { value: 0 }, uShift: { value: 0 }, uGlitch: { value: 0 }, uCrt: { value: 1 },
    uBloom: { value: new THREE.Vector3(0.25, 0.85, 0.45) },
    uEdge: { value: { a: 1, b: 2, c: 3, abc: 4 }[new URLSearchParams(location.search).get('edge')] || 0 },
    tDepth: { value: null }, uNearFar: { value: new THREE.Vector2(0.1, 100) },
    uFogCol: { value: new THREE.Color() }, uFogFar: { value: 50 },
  };
  const mat = new THREE.ShaderMaterial({
    fragmentShader: FRAG,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    uniforms, depthTest: false, depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  if (uniforms.uEdge.value === 4) {                    // letters over the three thirds of the comparison
    const tag = document.createElement('div');
    tag.style.cssText = 'position:fixed;top:12px;left:0;right:0;display:flex;pointer-events:none;z-index:50;font:16px monospace;color:#e33';
    tag.innerHTML = ['A', 'B', 'C'].map(l => `<span style="flex:1;text-align:center">${l}</span>`).join('');
    document.body.appendChild(tag);
  }
  let glitch = 0;

  function resize() {
    if (rt) rt.dispose();
    const dpr = renderer.getPixelRatio();
    const w = Math.round(renderer.domElement.clientWidth * dpr), h = Math.round(renderer.domElement.clientHeight * dpr);
    rt = new THREE.WebGLRenderTarget(w, h, { depthTexture: new THREE.DepthTexture(w, h) });   // the water reads the depth (water.js)
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    uniforms.tScene.value = rt.texture;
    uniforms.tDepth.value = rt.depthTexture;
  }
  resize();

  return {
    get enabled() { return quality.p.post; },
    resize,
    burst(strength = 1) { glitch = Math.min(1.5, glitch + strength); },
    render(mainScene, mainCam, dt, t, speed) {
      if (!quality.p.post) { renderer.setRenderTarget(null); renderer.render(mainScene, mainCam); return; }
      glitch = Math.max(0, glitch - dt * 2.2);
      uniforms.uTime.value = t;
      if (uniforms.uEdge.value) {
        uniforms.uNearFar.value.set(mainCam.near, mainCam.far);
        const fog = mainScene.fog;
        if (fog) { uniforms.uFogCol.value.copy(fog.color); uniforms.uFogFar.value = fog.isFogExp2 ? 1.52 / fog.density : fog.far; }   // exp2 fog is 90% closed at √ln10 / density
      }
      const acc = window.__app?.zone?.accept ?? 0;
      uniforms.uBloom.value.set(0.25 + 0.75 * acc, 0.85 + 0.07 * acc, 0.45 + 0.41 * acc);   // green, and in the light (1, 0.92, 0.86)
      const crt = 1 - 0.75 * acc;                        // the light stage is a quarter as much television
      uniforms.uCrt.value = crt;
      uniforms.uGlitch.value = glitch * crt;
      uniforms.uShift.value = (Math.min(0.0018, Math.abs(speed) * 0.0003) + glitch * 0.002) * crt; // no resting RGB split: small lights stay whole
      const water = window.__app?.water;
      if (water?.refracting) {                           // the frame without the water, then the water over it
        uniforms.tWater.value = water.renderSplit(mainScene, mainCam, rt);
        uniforms.uWaterOn.value = 1;
      } else {
        uniforms.uWaterOn.value = 0;
        renderer.setRenderTarget(rt);
        renderer.render(mainScene, mainCam);
      }
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
