import * as THREE from 'three';
import { Quality } from './quality.js';
import { InputRouter } from './input.js';
import { UI, detectCapabilities } from './ui.js';

const canvas = document.getElementById('gl');
const caps = detectCapabilities();
const ui = new UI();

if (!caps.webgl2) {
  ui.showWebglError();
} else {
  boot();
}

async function boot() {
  await ui.runBootSequence(caps);
  ui.showCapabilityResult(caps);
  ui.initModeSelect(caps.recommendedMode, caps);
  document.getElementById('mode-select')?.classList.remove('hidden');
  document.getElementById('btn-enter')?.classList.remove('hidden');

  const quality = new Quality();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.tier > 0, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(quality.p.pixelRatio, devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);

  const far = quality.tier === 0 ? 60 : 120;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x081008, 0.02); // placeholder, tuned by later tasks

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, far);
  camera.position.set(0, 1.6, 4);
  camera.lookAt(0, 0.5, 0);

  // temporary gray ground + box so the render is verifiable before Enter; both
  // are removed once the labyrinth streams in (see startWorld()).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x808080 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xc1121f })
  );
  box.position.set(0, 0.5, 0);
  scene.add(box);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(3, 5, 2);
  scene.add(light);
  const ambient = new THREE.AmbientLight(0x888888, 1);
  scene.add(ambient);

  const router = new InputRouter();
  let hands = null;
  let world = null;
  let player = null;
  let artworks = null;

  window.__app = { scene, camera, renderer, quality };

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  const clock = new THREE.Clock();
  let t = 0, atmo = null, post = null, audio = null;
  let prevBobSin = 0, prevYaw = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    quality.govern(dt);
    audio = audio ?? window.__app.audio;
    let speed = 0;
    if (player) {
      player.update(dt);
      world.update(player.pos.x, player.pos.y);
      atmo = atmo ?? window.__app.atmo;
      if (atmo) atmo.update(dt, t, camera.position);
      if (artworks) { artworks.sync(); artworks.update(dt); }
      speed = player.vel.length();
      if (audio) {
        const bobSin = Math.sin(player.bob);
        if (speed > 0.15 && bobSin > 0 && prevBobSin <= 0) audio.step();
        prevBobSin = bobSin;
        audio.turn((player.yaw - prevYaw) / dt);
      }
      prevYaw = player.yaw;
    } else {
      box.rotation.y += dt * 0.4; // pre-Enter idle
    }
    post = post ?? window.__app.post;
    if (audio) audio.motion(speed);
    if (post) post.render(scene, camera, dt, t, speed);
    else renderer.render(scene, camera);
  });

  const mode = await ui.waitForEnter();
  ui.hideWelcome();

  if (mode === 'light') {
    quality.tier = 0; // light mode contract: tier 0, radius 1, no post, half-res, no webcam
  }

  const { createPost } = await import('./post.js');
  post = createPost(renderer, quality);
  addEventListener('resize', () => post.resize());
  window.__app.post = post;

  const { AudioEngine } = await import('./audio.js');
  audio = new AudioEngine();
  audio.start(); // called from the Enter click handler chain — counts as a user gesture
  window.__app.audio = audio;
  const muteBtn = document.getElementById('btn-mute');
  muteBtn.classList.remove('hidden');
  let muted = false;
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    audio.setMuted(muted);
    muteBtn.classList.toggle('muted', muted);
  });

  router.on('dive', delta => { if (player) player.zoom(delta); });
  router.attachKeyboardMouse(canvas);
  if (mode === 'light') {
    router.attachLightTouch(canvas, state => { if (player) player.setTouch(state); });
    ui.showTouchHint();
  } else if (caps.touch) {
    router.attachTouch(canvas);
  }
  if (mode === 'keys') ui.showControlHud();
  if (mode === 'hands') ui.showHandLegend();

  ui.showExperienceControls({
    onFinish: () => {
      if (player) player.locked = true;
      document.exitPointerLock?.();
      audio?.setMuted(true);
      muteBtn.classList.add('muted');
      muted = true;
      ui.showFarewell();
    },
  });

  startWorld(mode);

  if (mode === 'hands') {
    try {
      const { HandInput } = await import('./hands.js');
      hands = new HandInput(state => { if (player) player.setHand(state); });
      await hands.start(); // requests webcam permission, opt-in only
    } catch (e) {
      console.warn('hand tracking unavailable, falling back:', e);
      if (player) player.mode = 'keys'; // webcam denied/unavailable: fall back to keyboard
      ui.showToast('Webcam unavailable — switched to keyboard controls.');
    }
  }

  // dev hook
  window.__router = router;

  async function startWorld(mode) {
    const { World } = await import('./world.js');
    const { Player } = await import('./player.js');
    const { createMaterials } = await import('./materials.js');
    const { Artworks } = await import('./artworks.js');

    // swap the placeholder scaffold for labyrinth-appropriate lighting
    scene.remove(ground); ground.geometry.dispose(); ground.material.dispose();
    scene.remove(box); box.geometry.dispose(); box.material.dispose();
    scene.remove(light); scene.remove(ambient); // sunlit/flat lighting makes no sense indoors; panels light the scene
    scene.fog = new THREE.FogExp2(0x0e1f14, quality.tier === 0 ? 0.045 : 0.03); // dreamcore-green haze, visibility fades ~35m at tier 2

    const atmo = createMaterials(quality);
    const radius = quality.tier === 0 ? 1 : 2;
    world = new World(scene, { buildRadius: radius, disposeRadius: radius + 1, materials: atmo.materials });
    player = new Player(world, camera, canvas, { mode });
    world.update(player.pos.x, player.pos.y); // build initial chunks before first frame
    artworks = await Artworks.create(scene, world, quality, camera, player, router);
    artworks.sync();

    window.__app.world = world;
    window.__app.player = player;
    window.__app.atmo = atmo;
    window.__app.artworks = artworks;
  }
}
