import * as THREE from 'three';
import { sketchParam } from './device.js';
import { Quality } from './quality.js';
import { InputRouter, keyCode } from './input.js';
import { UI, detectCapabilities } from './ui.js';
import { t, applyStatic, setLang, langFromUrl, getLang } from './i18n.js';
import { mixZone, SoulStage } from './zones.js';
import { createClip, clipSupported } from './clip.js';
import { installBugReport, setBugSource, bugTick, bugFrame } from './bugreport.js';

installBugReport();   // R R R anywhere: a picture of the state to screenshot and send
// F: full screen, on every screen and in every mode
addEventListener('keydown', e => {
  if (keyCode(e) !== 'KeyF' || e.repeat || e.metaKey || e.ctrlKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
scrollTo(0, 0);

const canvas = document.getElementById('gl');
const caps = detectCapabilities();
const ui = new UI();
// gallery.html: an installation, no gates or buttons (gallery.js)
const GALLERY = document.body.classList.contains('gallery');
let gallery = null;
// ?enter=hands: straight into a fresh labyrinth on gestures, no gates (after Тренировка)
const DIRECT = !GALLERY && new URLSearchParams(location.search).get('enter') === 'hands' && langFromUrl();
// once only: a reload shows the gates again (the seed goes once world.js has read it)
const dropParams = (...keys) => { const u = new URL(location.href); keys.forEach(k => u.searchParams.delete(k)); history.replaceState(null, '', u); };
if (DIRECT) dropParams('enter');

if (!caps.webgl2) {
  applyStatic();
  ui.showWebglError();
} else if (GALLERY) {
  setLang(langFromUrl() || 'ru');
  applyStatic();
  import('./gallery.js').then(async m => {
    gallery = m.createGallery();
    const camera = gallery.startCamera();
    boot();
    await camera;
  });
} else if (DIRECT) {
  setLang(DIRECT);
  applyStatic();
  document.getElementById('lang-gate')?.classList.add('hidden');
  boot();
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
  if (!GALLERY && !DIRECT) {
    await ui.runBootSequence(caps);
    ui.showCapabilityResult(caps);
    ui.initModeSelect(caps.recommendedMode, caps);
    document.getElementById('mode-select')?.classList.remove('hidden');
    document.getElementById('btn-enter')?.classList.remove('hidden');
  }

  const quality = new Quality();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.tier > 0, powerPreference: 'high-performance' });
  renderer.setPixelRatio(quality.pixelRatio);
  // when the governor steps the tier down, render fewer pixels right away
  quality.onDowngrade = () => {
    renderer.setPixelRatio(quality.pixelRatio);
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

  // before the labyrinth streams in (startWorld()) the scene is just the dark

  const router = new InputRouter();
  let hands = null;
  let world = null;
  let player = null;
  let artworks = null;

  const stage = new SoulStage(); // advanced only by walking through portals
  window.__app = { scene, camera, renderer, quality, stage };
  setBugSource(canvas);

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  const clock = new THREE.Clock();
  let elapsed = 0, atmo = null, post = null, audio = null; // not `t`: that name is the translator
  let prevBobSin = 0, prevYaw = 0;
  const dustLight = new THREE.Color();
  const ACC_FOG_0 = new THREE.Color(0xcabec6), ACC_FOG_1 = new THREE.Color(0xe9e3df), accFogA = new THREE.Color();
  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    quality.govern(dt);
    bugTick(dt);
    audio = audio ?? window.__app.audio;
    let speed = 0;
    if (player) {
      player.update(dt);
      ui.hintsTick(dt, player.vel.length() > 0.15, caps.device.isTouch);
      world.update(player.pos.x, player.pos.y);
      atmo = atmo ?? window.__app.atmo;
      // "Путь души": fog and clear colour follow the zone the visitor stands in
      stage.update(dt);
      const zone = stage.weights();
      window.__app.zone = zone;
      if (scene.fog?.isFogExp2) {
        // the light stage: a lilac pearl at the portal, milk once every work is found
        const accFog = accFogA.copy(ACC_FOG_0).lerp(ACC_FOG_1, window.__app.water?.progress ?? 0).getHex();
        mixZone(scene.fog.color, zone, 0x0e1f14, 0x030905, accFog);
        const base = quality.tier === 0 ? 1.5 : 1;
        scene.fog.density = base * (0.03 * zone.fear + 0.045 * zone.memory + 0.085 * zone.accept);   // the light stage stands in milky fog
        const vanish = window.__app.vanish ?? 0;           // the finale: the haze swells while the walls go, then thins over open water
        if (vanish > 0) scene.fog.density *= 1 + 1.6 * Math.sin(Math.PI * vanish) - 0.35 * vanish;
        renderer.setClearColor(scene.fog.color);
      }
      if (atmo) atmo.update(dt, elapsed, camera.position, zone);
      if (window.__app.dust) {
        mixZone(dustLight, zone, 0xd6e8da, 0xff5a48, 0xf4e8e0);
        window.__app.dust.update(elapsed, camera.position, dustLight);
        window.__app.spots?.update(elapsed, camera.position, dustLight);
      }
      if (window.__app.soul) window.__app.soul.update(dt, elapsed, zone);
      window.__app.events?.update(dt);
      window.__app.water?.update(dt, elapsed, player, window.__app.soul, audio);
      if (artworks) { artworks.sync(); artworks.update(dt); }
      speed = player.vel.length();
      if (audio) {
        const bobSin = Math.sin(player.bob);
        if (speed > 0.15 && bobSin > 0 && prevBobSin <= 0) {
          audio.step();
          window.__app.water?.addRipple(player.pos.x, player.pos.y, speed > 3.2 ? 1.2 : 0.7);   // running splashes harder
        }
        prevBobSin = bobSin;
        if (dt > 0) audio.turn((player.yaw - prevYaw) / dt);   // two frames can share a timestamp: 0/0 would stop the loop
      }
      prevYaw = player.yaw;
    }
    post = post ?? window.__app.post;
    if (audio) audio.motion(speed);
    if (!window.__app.tunnel?.covering) {   // in the portal's flight the tunnel hides it all: nothing under it is drawn
      window.__app.water?.beforeRender();   // the mirror pass, tier 2 only (the refraction split happens inside post.render)
      if (post) post.render(scene, camera, dt, elapsed, speed);
      else renderer.render(scene, camera);
    }
    window.__app.tunnel?.render(dt);
    window.__app.clip?.frame();   // copy the frame while the drawing buffer still holds it
    bugFrame();
  };
  renderer.setAnimationLoop(frame);
  window.__app.frame = frame;   // dev hook: step the world by hand (headless checks, hidden tabs)

  const { mode, cameraStream, training } = GALLERY ? await gallery.waitForVisitor()
    : DIRECT ? { mode: 'hands', cameraStream: null, training: false } : await ui.waitForEnter();
  document.body.classList.add('walking');   // from here a long press on a phone never selects anything (style.css)
  ui.hideWelcome();
  ui.showLoading();

  if (mode === 'keys' && caps.device.isPhone) {
    quality.tier = 0; // buttons on a phone: tier 0, radius 1, no post, half-res, no webcam
  } // tablets keep their detected tier; the FPS governor steps it down if needed

  const { createPost } = await import('./post.js');
  post = createPost(renderer, quality);
  addEventListener('resize', () => post.resize());
  window.__app.post = post;
  window.__app.tunnel = (await import('./tunnel.js')).createTunnel(renderer);   // the crossing between stages

  const { AudioEngine } = await import('./audio.js');
  audio = new AudioEngine();
  audio.start(); // called from the Enter click handler chain — counts as a user gesture
  window.__app.audio = audio;
  if (GALLERY) {
    // no gesture before the walk in a gallery: run Chrome with
    // --autoplay-policy=no-user-gesture-required, or any touch wakes the sound
    audio.setVolume?.(gallery.params.volume);
    const wake = () => audio.ctx?.resume();
    addEventListener('pointerdown', wake); addEventListener('keydown', wake);
    gallery.watch();
  }
  if (DIRECT) {                                      // no click on this page yet: the first touch or key wakes the sound
    const wake = () => audio.ctx?.resume();
    addEventListener('pointerdown', wake); addEventListener('keydown', wake);
  }
  const muteBtn = document.getElementById('btn-mute');
  if (!GALLERY) muteBtn.classList.remove('hidden');
  let muted = false;
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    audio.setMuted(muted);
    muteBtn.classList.toggle('muted', muted);
    muteBtn.querySelector('span').textContent = t(muted ? 'soundOff' : 'soundOn');
  });
  // one volume for everything, remembered on this device
  const volBox = document.getElementById('vol'), volRange = document.getElementById('vol-range');
  let vol = 1;
  try { const v = parseFloat(localStorage.getItem('conspace-volume')); if (v >= 0 && v <= 1) vol = v; } catch (e) { /* storage blocked */ }
  volRange.value = String(Math.round(vol * 100));
  volRange.setAttribute('aria-label', t('volume'));
  audio.setVolume(vol);
  if (!GALLERY) volBox.classList.remove('hidden');
  volRange.addEventListener('input', () => {
    vol = volRange.value / 100;
    audio.setVolume(vol);
    try { localStorage.setItem('conspace-volume', String(vol)); } catch (e) {}
  });

  router.on('dive', delta => { if (player) player.zoom(delta); });
  router.on('drive', v => { if (player) player.setDrive(v); });
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

  if (!GALLERY && clipSupported()) {
    window.__app.clip = createClip({
      source: renderer.domElement, audio,
      getCount: () => window.__app.soul?.seen.size ?? 0, total: window.__app.artworks?.list?.length || 18,
      strings: { rec: t('clipRec'), save: t('clipSave'), roses: t('clipRoses') },
    });
  }
  if (!GALLERY) ui.showExperienceControls({
    onClip: window.__app.clip ? () => window.__app.clip.recording || window.__app.clip.start() : null,
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

  // if the labyrinth cannot be built, say so gently and offer to try again,
  // instead of leaving the visitor in the dark
  const worldReady = startWorld().catch(e => {
    ui.hideLoading();
    console.error('[world] could not be built', e);
    const el = document.createElement('div');
    el.id = 'world-broken';
    el.innerHTML = `<p>${t('worldBroken')}</p><button type="button" class="tape">${t('worldRetry')}</button>`;
    el.querySelector('button').addEventListener('click', () => location.reload());
    document.body.appendChild(el);
  });

  // a hand state to the walk; running with a fist carried sideways asks to stop first
  let runToastAt = 0;
  const onHand = state => {
    if (player) player.setHand(state);
    if (state.runTurn && performance.now() - runToastAt > 5000) { runToastAt = performance.now(); ui.showToast(t('runTurn')); }
  };
  let handsReady = Promise.resolve();
  if (mode === 'hands') handsReady = (async () => {
    try {
      if (GALLERY) {                                  // already watching since the attract screen
        hands = gallery.hands;
        hands.onUpdate = onHand;
        hands.onError = handleCameraFailure;
      } else {
        const { HandInput } = await import('./hands.js');
        hands = new HandInput(onHand, handleCameraFailure);
        const stream = cameraStream ? await cameraStream : null;
        await hands.start(stream); // uses the pre-authorized stream from the Enter click, opt-in only
      }
    } catch (e) {
      console.warn('hand tracking unavailable, falling back:', e);
      handleCameraFailure();
    }
  })();
  Promise.all([worldReady, handsReady]).then(() => {
    ui.hideLoading();
    if (DIRECT) dropParams('seed');
    // Тренировка: the six gestures one at a time, while the walk begins (training.js)
    // and then a new labyrinth with a new seed, straight on gestures
    if (training && activeMode === 'hands' && player) import('./training.js').then(m => m.startTraining({
      player,
      onDone: () => {
        const u = new URL(location.href);
        u.searchParams.set('lang', getLang());
        u.searchParams.set('seed', String(Math.floor(Math.random() * 2 ** 31)));
        u.searchParams.set('enter', 'hands');
        location.replace(u);
      },
    }));
  });

  // dev hook
  window.__router = router;

  async function startWorld() {
    const { World } = await import('./world.js');
    const { Player } = await import('./player.js');
    const { createMaterials } = await import('./materials.js');
    const { Artworks } = await import('./artworks.js');

    // swap the placeholder scaffold for labyrinth-appropriate lighting
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
    const { createWater } = await import('./water.js');
    window.__app.water = createWater({ scene, renderer, camera, quality, stage, atmo });   // hidden until the light stage

    const { createDust } = await import('./dust.js');
    window.__app.dust = createDust(scene, quality);
    const { createSpots } = await import('./spots.js');
    window.__app.spots = createSpots(scene, quality);
    const { SoulPath } = await import('./soulpath.js');
    window.__app.soul = new SoulPath({ scene, world, player, camera, artworks, audio, post, quality, renderer, stage, atmo });
    const { EventDirector } = await import('./events.js');
    window.__app.events = new EventDirector({ scene, world, player, audio, atmo, stage, soul: window.__app.soul });   // one event every 20-40 s (#43)
    if (['clouds', 'fogtop', 'plants'].some(k => sketchParam(k) !== null)) stage.set(2);   // a ceiling sketch: straight into the light to judge it
    const plantDraft = sketchParam('plantdraft');   // fear|room|accept|strelitzia|alocasia|fiddle|calathea: one draft plant in front of the visitor (#39)
    if (plantDraft && !['fear', 'room'].includes(plantDraft)) stage.set(2);
    if (plantDraft) import('./plants.js').then(m => m.placePlantDraft(plantDraft, { scene, player, atmo, renderer }));
    if (new URLSearchParams(location.search).has('dbg')) import('./debug.js').then(m => m.openDebug({ renderer, quality, post, atmo }));   // phone debugging
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
