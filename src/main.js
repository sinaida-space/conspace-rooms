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
  ui.showCapabilityResult(caps);
  ui.initModeSelect(caps.recommendedMode);

  const quality = new Quality();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.tier > 0, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(quality.p.pixelRatio, devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);

  const far = quality.tier === 0 ? 60 : 120;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x141414, 0.02); // placeholder, tuned by later tasks

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

  window.__app = { scene, camera, renderer, quality };

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    quality.govern(dt);
    if (player) {
      player.update(dt);
      world.update(player.pos.x, player.pos.y);
    } else {
      box.rotation.y += dt * 0.4; // pre-Enter idle
    }
    renderer.render(scene, camera);
  });

  const mode = await ui.waitForEnter();
  ui.hideWelcome();

  router.attachKeyboardMouse(canvas);
  if (caps.touch) router.attachTouch(canvas);

  startWorld(mode);

  if (mode === 'hands') {
    try {
      const { HandInput } = await import('./hands.js');
      hands = new HandInput(state => { if (player) player.setHand(state); });
      await hands.start(); // requests webcam permission, opt-in only
    } catch (e) {
      console.warn('hand tracking unavailable, falling back:', e);
    }
  }

  // dev hook
  window.__router = router;

  async function startWorld(mode) {
    const { World } = await import('./world.js');
    const { Player } = await import('./player.js');

    // swap the placeholder scaffold for labyrinth-appropriate lighting
    scene.remove(ground); ground.geometry.dispose(); ground.material.dispose();
    scene.remove(box); box.geometry.dispose(); box.material.dispose();
    scene.remove(light); // directional sun makes no sense indoors

    // camera-attached point light (flat placeholder lighting; #3 refines)
    const lamp = new THREE.PointLight(0xfff2e6, 9, 22, 1.2);
    camera.add(lamp);
    scene.add(camera);

    const radius = quality.tier === 0 ? 1 : 2;
    world = new World(scene, { buildRadius: radius, disposeRadius: radius + 1 });
    player = new Player(world, camera, canvas, { mode });
    world.update(player.pos.x, player.pos.y); // build initial chunks before first frame

    window.__app.world = world;
    window.__app.player = player;
  }
}
