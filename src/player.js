import * as THREE from 'three';
import { CELL } from './world.js';

// ── conspace-rooms · player.js ──────────────────────────────────────────────
// First-person walker. Two input paths feeding one controller:
//   • gestures (HandInput): both fists → walk, pointing hand → turn that way,
//     both open palms → stop (and zoom while held), pinch → inspect
//   • fallback: WASD + pointer-lock mouse look
// Capsule-vs-wall collision slides along walls (never clips through). Motion is
// liminal-calm: soft acceleration, gentle head-bob.

const EYE = 1.65;          // eye height (m)
const RADIUS = 0.3;        // capsule radius (m)
const MAX_SPEED = 2.2;     // m/s
const ACCEL = 9;           // approach rate toward target velocity (1/s)
const YAW_RATE = 1.8;      // rad/s while turning
const DEADZONE = 0.15;     // touch-turn deadzone
const MOUSE_SENS = 0.0022; // rad per pixel
const PITCH_LIMIT = 1.2;   // rad
const BOB_AMP = 0.02;      // head-bob amplitude (m)
const BOB_FREQ = 9;        // head-bob rate scaler
const MIN_FOV = 35;        // deg — fully zoomed in
const MAX_FOV = 70;        // deg — resting FOV, matches main.js's initial camera
const ZOOM_SENS = 240;     // FOV degrees per unit of hand-distance change

export class Player {
  constructor(world, camera, canvas, opts = {}) {
    this.world = world;
    this.camera = camera;
    this.canvas = canvas;
    this.mode = opts.mode || 'keys';

    // spawn on a known-open corridor cell near origin (local cell 4,4 is a band)
    const sx = opts.spawn?.x ?? 4 * CELL + CELL / 2;
    const sz = opts.spawn?.z ?? 4 * CELL + CELL / 2;
    this.pos = new THREE.Vector2(sx, sz); // (x, z)
    this.vel = new THREE.Vector2(0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.bob = 0;

    this.keys = Object.create(null);
    this.hand = {
      present: false, bothFists: false, pointLeft: false, pointRight: false,
      stopped: false, pinch: false, zoomDelta: 0,
    };
    this.touch = { forward: false, turn: 0 };
    this.locked = false; // set true during artwork inspect (#4) — update() becomes a no-op
    this.fov = camera.fov; // gesture zoom target (both palms open + spread/pinch)

    this._attach();
    this._apply();
  }

  setHand(state) { this.hand = state; }
  setTouch(state) { this.touch = state; }

  // Mouse-wheel / two-finger touch pinch ('dive' events) drive the same FOV
  // zoom as the gesture zoom below — negative delta (scroll up / spread
  // fingers) zooms in.
  zoom(delta) {
    this.fov = clamp(this.fov + delta * 15, MIN_FOV, MAX_FOV);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  _attach() {
    addEventListener('keydown', e => {
      if (e.code === 'Escape') { document.exitPointerLock?.(); return; }
      this.keys[e.code] = 1;
    });
    addEventListener('keyup', e => { this.keys[e.code] = 0; });

    // pointer-lock mouse look (keyboard mode)
    this.canvas.addEventListener('click', () => {
      if (this.mode === 'keys') this.canvas.requestPointerLock?.();
    });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== this.canvas) return;
      this.yaw -= e.movementX * MOUSE_SENS;
      this.pitch = clamp(this.pitch - e.movementY * MOUSE_SENS, -PITCH_LIMIT, PITCH_LIMIT);
    });
  }

  update(dt) {
    if (this.locked) return; // inspect mode owns the camera; leave pos/yaw/pitch untouched

    // ── yaw from a pointing hand (fixed-rate turn, like arrow keys) ──
    if (this.hand.present) {
      if (this.hand.pointRight) this.yaw -= YAW_RATE * dt;   // right hand points → turn right
      else if (this.hand.pointLeft) this.yaw += YAW_RATE * dt; // left hand points → turn left
    } else if (this.mode === 'light' && Math.abs(this.touch.turn) > DEADZONE) {
      const p = this.touch.turn;
      const s = (p - Math.sign(p) * DEADZONE) / (1 - DEADZONE);
      this.yaw -= s * YAW_RATE * dt;
    } else if (this.mode !== 'light' && !this.hand.present) {
      // arrow-left/right turn the camera directly (independent of pointer-lock
      // mouse look, which stays optional) — A/D remain strafe below.
      const turn = (this.keys.ArrowRight ? 1 : 0) - (this.keys.ArrowLeft ? 1 : 0);
      if (turn) this.yaw -= turn * YAW_RATE * dt;
    }

    // ── gesture zoom: only while both palms are open ("stop"), spreading or
    // pinching the two hands narrows/widens the FOV ──
    if (this.hand.present && this.hand.stopped && this.hand.zoomDelta) {
      this.fov = clamp(this.fov - this.hand.zoomDelta * ZOOM_SENS, MIN_FOV, MAX_FOV);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // ── movement intent ──
    let walk, strafe;
    if (this.hand.present) {
      walk = this.hand.bothFists ? 1 : 0; // both hands as fists walks forward; anything else stops
      strafe = 0;
    } else if (this.mode === 'light') {
      walk = this.touch.forward ? 1 : 0; // hold top half of screen to walk
      strafe = 0;
    } else {
      walk = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
      strafe = (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0);
    }

    // heading basis (camera faces -Z at yaw 0)
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); // forward
    const rx = -fz, rz = fx;                                   // right
    let tx = fx * walk + rx * strafe;
    let tz = fz * walk + rz * strafe;
    const tl = Math.hypot(tx, tz);
    if (tl > 1) { tx /= tl; tz /= tl; }
    const target = new THREE.Vector2(tx * MAX_SPEED, tz * MAX_SPEED);

    // soft accel toward target velocity
    const k = Math.min(1, ACCEL * dt);
    this.vel.x += (target.x - this.vel.x) * k;
    this.vel.y += (target.y - this.vel.y) * k;

    // ── integrate + collide ──
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.y + this.vel.y * dt;
    const resolved = this._collide(nx, nz);
    // kill velocity component lost to the wall (so accel doesn't build up into it)
    this.vel.x = (resolved.x - this.pos.x) / dt || 0;
    this.vel.y = (resolved.z - this.pos.y) / dt || 0;
    this.pos.set(resolved.x, resolved.z);

    // ── head-bob (subtle, only while moving) ──
    const speed = this.vel.length();
    let bobY = 0;
    if (speed > 0.15) {
      this.bob += dt * BOB_FREQ * (speed / MAX_SPEED);
      bobY = Math.sin(this.bob) * BOB_AMP * Math.min(1, speed / MAX_SPEED);
    }

    this._apply(bobY);
  }

  // capsule (as a disc of RADIUS in XZ) vs axis-aligned wall segments; slides.
  _collide(x, z) {
    let px = x, pz = z;
    for (let iter = 0; iter < 3; iter++) {
      const segs = this.world.wallSegmentsNear(px, pz);
      let moved = false;
      for (const s of segs) {
        const c = closestOnSeg(px, pz, s.a.x, s.a.z, s.b.x, s.b.z);
        let dx = px - c.x, dz = pz - c.z;
        let d = Math.hypot(dx, dz);
        if (d >= RADIUS) continue;
        if (d < 1e-6) { dx = s.nx; dz = s.nz; d = 1; } // dead centre → use normal
        const push = (RADIUS - d) / d;
        px += dx * push; pz += dz * push;
        moved = true;
      }
      if (!moved) break;
    }
    return { x: px, z: pz };
  }

  _apply(bobY = 0) {
    this.camera.position.set(this.pos.x, EYE + bobY, this.pos.y);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function closestOnSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const len2 = vx * vx + vz * vz || 1e-9;
  let t = ((px - ax) * vx + (pz - az) * vz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + vx * t, z: az + vz * t };
}
