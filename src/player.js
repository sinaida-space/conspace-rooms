import * as THREE from 'three';
import { CELL } from './world.js';

// ── conspace-rooms · player.js ──────────────────────────────────────────────
// First-person walker. Two input paths feeding one controller:
//   • gestures (HandInput): palmX → yaw rate, fist → walk forward, no hand → stop
//   • fallback: WASD + pointer-lock mouse look
// Capsule-vs-wall collision slides along walls (never clips through). Motion is
// liminal-calm: soft acceleration, gentle head-bob.

const EYE = 1.65;          // eye height (m)
const RADIUS = 0.3;        // capsule radius (m)
const MAX_SPEED = 2.2;     // m/s
const ACCEL = 9;           // approach rate toward target velocity (1/s)
const YAW_RATE = 1.8;      // rad/s at full palm deflection
const DEADZONE = 0.15;     // palmX deadzone
const MOUSE_SENS = 0.0022; // rad per pixel
const PITCH_LIMIT = 1.2;   // rad
const BOB_AMP = 0.02;      // head-bob amplitude (m)
const BOB_FREQ = 9;        // head-bob rate scaler

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
    this.hand = { palmX: 0, fist: false, present: false };

    this._attach();
    this._apply();
  }

  setHand(state) { this.hand = state; }

  _attach() {
    addEventListener('keydown', e => {
      if (e.code === 'Escape') { document.exitPointerLock?.(); return; }
      this.keys[e.code] = 1;
    });
    addEventListener('keyup', e => { this.keys[e.code] = 0; });

    // pointer-lock mouse look (keyboard mode)
    this.canvas.addEventListener('click', () => {
      if (this.mode !== 'hands') this.canvas.requestPointerLock?.();
    });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== this.canvas) return;
      this.yaw -= e.movementX * MOUSE_SENS;
      this.pitch = clamp(this.pitch - e.movementY * MOUSE_SENS, -PITCH_LIMIT, PITCH_LIMIT);
    });
  }

  update(dt) {
    // ── yaw from gesture palm (rate control, with deadzone) ──
    if (this.hand.present && Math.abs(this.hand.palmX) > DEADZONE) {
      const p = this.hand.palmX;
      const s = (p - Math.sign(p) * DEADZONE) / (1 - DEADZONE); // -1..1
      this.yaw -= s * YAW_RATE * dt; // palm-right → turn right
    }

    // ── movement intent ──
    let walk, strafe;
    if (this.hand.present) {
      walk = this.hand.fist ? 1 : 0;   // fist walks forward; open hand stops
      strafe = 0;
    } else {
      walk = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
      strafe = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0);
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
