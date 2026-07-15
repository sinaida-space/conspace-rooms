// Post-processing pass: RGB delay tied to speed, scanlines and noise, glitch
// bursts on demand. Init-only — not auto-started; call render() from the
// app loop once wired up.
import * as THREE from 'three';

const FRAG = /* glsl */`
precision highp float;
uniform sampler2D tScene;
uniform float uTime, uShift, uGlitch;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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
  c.r = texture2D(tScene, uv + vec2(s, 0.0)).r;
  c.g = texture2D(tScene, uv).g;
  c.b = texture2D(tScene, uv - vec2(s, 0.0)).b;

  // cheap phosphor bloom: sample a small ring around this texel, keep only
  // the brightest neighbours, add back tinted green — a poor-man's
  // threshold+blur bloom in a single pass (no extra render targets needed)
  vec3 glow = vec3(0.0);
  float px = 1.0 / 720.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854; // 2*PI/8
    vec2 o = vec2(cos(a), sin(a)) * px * 3.0;
    vec3 samp = texture2D(tScene, uv + o).rgb;
    float bright = max(samp.r, max(samp.g, samp.b));
    glow += samp * smoothstep(0.55, 1.0, bright);
  }
  glow /= 8.0;
  c += glow * vec3(0.25, 0.85, 0.45) * 0.55;

  // scanlines + noise
  c *= 0.90 + 0.10 * sin(uv.y * 900.0 + uTime * 8.0);
  c += (hash(uv * vec2(1441.0, 907.0) + fract(uTime)) - 0.5) * 0.055;
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
    tScene: { value: null },
    uTime: { value: 0 }, uShift: { value: 0 }, uGlitch: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    fragmentShader: FRAG,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    uniforms, depthTest: false, depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  let glitch = 0;

  function resize() {
    if (rt) rt.dispose();
    const dpr = renderer.getPixelRatio();
    rt = new THREE.WebGLRenderTarget(
      Math.round(renderer.domElement.clientWidth * dpr),
      Math.round(renderer.domElement.clientHeight * dpr)
    );
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    uniforms.tScene.value = rt.texture;
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
      uniforms.uGlitch.value = glitch;
      uniforms.uShift.value = 0.0006 + Math.min(0.005, Math.abs(speed) * 0.0006) + glitch * 0.002;
      renderer.setRenderTarget(rt);
      renderer.render(mainScene, mainCam);
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
    },
  };
}
