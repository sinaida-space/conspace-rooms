import * as THREE from 'three';
import { Quality } from './quality.js';
import { InputRouter } from './input.js';
import { UI, detectCapabilities } from './ui.js';
import { t, applyStatic } from './i18n.js';
import { mixZone, SoulStage } from './zones.js';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
scrollTo(0, 0);

const canvas = document.getElementById('gl');
const caps = detectCapabilities();
const ui = new UI();

if (!caps.webgl2) {
  applyStatic();
  ui.showWebglError();
} else {
  ui.gateLanguage().then(() => ui.gateConsent()).then(() => {
    const welcome = document.getElementById('welcome');
    welcome?.classList.remove('hidden');
    if (welcome) welcome.scrollTop = 0; // always open at the top
    import('./molecule.js').then(m => m.startMolecule(document.getElementById('welcome')));
    boot();
  });
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
  // when the governor steps the tier down, render fewer pixels right away
  quality.onDowngrade = () => {
    renderer.setPixelRatio(Math.min(quality.p.pixelRatio, devicePixelRatio));
    renderer.setSize(innerWidth, innerHeight);
    window.__app?.post?.resize();
  };
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

  const stage = new SoulStage(); // advanced only by walking through portals
  window.__app = { scene, camera, renderer, quality, stage };

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  const clock = new THREE.Clock();
  let elapsed = 0, atmo = null, post = null, audio = null; // not `t`: that name is the translator
  let prevBobSin = 0, prevYaw = 0;
  const dustLight = new THREE.Color();
  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    quality.govern(dt);
    audio = audio ?? window.__app.audio;
    let speed = 0;
    if (player) {
      player.update(dt);
      world.update(player.pos.x, player.pos.y);
      atmo = atmo ?? window.__app.atmo;
      // "Путь души": fog and clear colour follow the zone the visitor stands in
      stage.update(dt);
      const zone = stage.weights();
      window.__app.zone = zone;
      if (scene.fog?.isFogExp2) {
        mixZone(scene.fog.color, zone, 0x0e1f14, 0x030905, 0xa9b0a2);
        const base = quality.tier === 0 ? 1.5 : 1;
        scene.fog.density = base * (0.03 * zone.fear + 0.045 * zone.memory + 0.038 * zone.accept);
        renderer.setClearColor(scene.fog.color);
      }
      if (atmo) atmo.update(dt, elapsed, camera.position, zone);
      if (window.__app.dust) {
        mixZone(dustLight, zone, 0xd6e8da, 0xff5a48, 0xeeeee2);
        window.__app.dust.update(elapsed, camera.position, dustLight);
        window.__app.spots?.update(elapsed, camera.position, dustLight);
      }
      if (window.__app.soul) window.__app.soul.update(dt, elapsed, zone);
      if (artworks) { artworks.sync(); artworks.update(dt); }
      speed = player.vel.length();
      if (audio) {
        const bobSin = Math.sin(player.bob);
        if (speed > 0.15 && bobSin > 0 && prevBobSin <= 0) audio.step();
        prevBobSin = bobSin;
        if (dt > 0) audio.turn((player.yaw - prevYaw) / dt);   // two frames can share a timestamp: 0/0 would stop the loop
      }
      prevYaw = player.yaw;
    } else {
      box.rotation.y += dt * 0.4; // pre-Enter idle
    }
    post = post ?? window.__app.post;
    if (audio) audio.motion(speed);
    if (post) post.render(scene, camera, dt, elapsed, speed);
    else renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(frame);
  window.__app.frame = frame;   // dev hook: step the world by hand (headless checks, hidden tabs)

  const { mode, cameraStream } = await ui.waitForEnter();
  ui.hideWelcome();

  if (mode === 'keys' && caps.device.isPhone) {
    quality.tier = 0; // buttons on a phone: tier 0, radius 1, no post, half-res, no webcam
  } // tablets keep their detected tier; the FPS governor steps it down if needed

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
  if (caps.touch) router.attachTouch(canvas);   // pinch zoom only; walking is on the pad
  const showButtons = () => {
    ui.showPad({ keys: () => player ? player.keys : {}, pick: () => router.emit('pick') });
    if (!caps.device.isTouch) ui.showControlHud();
  };
  if (mode === 'keys') showButtons();
  if (mode === 'hands') ui.showHandLegend();

  // Camera failure fallback, shared between the initial start() rejection and
  // a later onError report from HandInput (task #2 may report a failure
  // after start() already resolved). Guarded to run at most once.
  // startWorld() is deliberately not awaited, so the camera can fail before
  // Player exists. activeMode is the single source of truth for the mode the
  // Player is eventually constructed with; writing only player.mode would be
  // a no-op in that race and would leave a touch user unable to move.
  let activeMode = mode;
  let cameraFallbackDone = false;
  function handleCameraFailure() {
    if (cameraFallbackDone) return;
    cameraFallbackDone = true;
    activeMode = 'keys';
    if (player) player.mode = 'keys';
    document.getElementById('hand-legend')?.remove(); // one legend at a time, never stacked
    showButtons();
    ui.showToast(t('camKeys'));
  }

  ui.showExperienceControls({
    onFinish: () => {
      if (player) player.locked = true;
      hands?.stop(); // release the camera and the detection loop, not just the view
      document.exitPointerLock?.();
      audio?.setMuted(true);
      muteBtn.classList.add('muted');
      muted = true;
      ui.showFarewell();
    },
  });

  startWorld();

  if (mode === 'hands') {
    try {
      const { HandInput } = await import('./hands.js');
      hands = new HandInput(state => { if (player) player.setHand(state); }, handleCameraFailure);
      const stream = cameraStream ? await cameraStream : null;
      await hands.start(stream); // uses the pre-authorized stream from the Enter click, opt-in only
    } catch (e) {
      console.warn('hand tracking unavailable, falling back:', e);
      handleCameraFailure();
    }
  }

  // dev hook
  window.__router = router;

  async function startWorld() {
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
    player = new Player(world, camera, canvas, { mode: activeMode });
    world.update(player.pos.x, player.pos.y); // build initial chunks before first frame
    artworks = await Artworks.create(scene, world, quality, camera, player, router);
    artworks.sync();

    window.__app.world = world;
    window.__app.player = player;
    window.__app.atmo = atmo;
    window.__app.artworks = artworks;

    const { createDust } = await import('./dust.js');
    window.__app.dust = createDust(scene, quality);
    const { createSpots } = await import('./spots.js');
    window.__app.spots = createSpots(scene, quality);
    const { SoulPath } = await import('./soulpath.js');
    window.__app.soul = new SoulPath({ scene, world, player, camera, artworks, audio, post, quality, renderer, stage, atmo });
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
