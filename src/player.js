import * as THREE from 'three';
import { CELL } from './world.js';

// ── conspace-rooms · player.js ──────────────────────────────────────────────
// First-person walker. Two input paths feeding one controller:
//   • gestures (HandInput): one fist → walk, both fists → run, pointing hand
//     (with no fist) → turn that way, both open palms → stop (and zoom while
//     held). On hands the walk keeps to the middle of the corridor (rails
//     with a little play) and the view settles along it.
//   • fallback: WASD + pointer-lock mouse look
// Capsule-vs-wall collision slides along walls (never clips through). Motion is
// liminal-calm: soft acceleration, gentle head-bob.

const EYE = 1.65;          // eye height (m)
const RADIUS = 0.3;        // capsule radius (m)
const MAX_SPEED = 3.2;     // m/s, walking
const RUN_SPEED = 6.0;     // m/s, Shift held (or ▲ on the pad held long)
const ACCEL = 9;           // approach rate toward target velocity (1/s)
const YAW_RATE = 1.8;      // rad/s while turning
const MOUSE_SENS = 0.0022; // rad per pixel
const PITCH_LIMIT = 1.2;   // rad
const BOB_AMP = 0.02;      // head-bob amplitude (m)
const BOB_FREQ = 9;        // head-bob rate scaler
const MIN_FOV = 35;        // deg — fully zoomed in
const MAX_FOV = 70;        // deg — resting FOV, matches main.js's initial camera
const ZOOM_SENS = 240;     // FOV degrees per unit of hand-distance change
const HAND_YAW_RATE = 1.15; // rad/s, turning by a pointing hand: slower than the keys, and eased in
const HAND_YAW_EASE = 4;   // 1/s, how fast the hand turn speeds up and settles
const RAIL_PLAY = 0.3;     // m either side of the corridor's middle the walk may drift freely
const RAIL_SOFT = 0.9;     // 1/s, gentle pull toward the middle inside the play
const RAIL_HARD = 5;       // 1/s, firm pull back once outside it
const RAIL_REACH = 5;      // m: a side with no wall this close is a crossing, no pull
const CORRIDOR_MAX = 3.0;  // m: a way this narrow is a corridor with a middle to keep (corridors are 2.4)
const OPENING_REACH = 1.6; // m either side a blocked walk looks for the opening it was meant for
const WALL_KEEP = 0.75;    // m: in rooms, a wall closer than this pushes the walk off it
const ALIGN_RATE = 1.6;    // 1/s, the view settling along the corridor while walking on hands
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export const EYE_HEIGHT = EYE;

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
    this.eye = EYE;        // current eye height; soulpath.js lowers it for the child-height secret
    this.eyeTarget = EYE;
    this.intent = 0;       // last walk intent: 1 forward, -1 backward, 0 still

    this.keys = Object.create(null);
    this.auto = null;      // { kind, yaw }: something else holds the walk (a question board) and turns the view
    this._yawVel = 0;      // eased turn speed on hands
    this.hand = {
      present: false, anyFist: false, bothFists: false, pointLeft: false, pointRight: false,
      stopped: false, pinch: false, zoomDelta: 0,
    };
    this.locked = false; // set true during artwork inspect (#4) — update() becomes a no-op
    this.fov = camera.fov; // gesture zoom target (both palms open + spread/pinch)

    this._attach();
    this._apply();
  }

  setHand(state) { this.hand = state; }
  // a finger dragged on a touch screen: x turns, -y walks (input.js attachTouch)
  setDrive(v) { this.drive = v; }

  // Mouse-wheel / two-finger touch pinch ('dive' events) drive the same FOV
  // zoom as the gesture zoom below — negative delta (scroll up / spread
  // fingers) zooms in.
  zoom(delta) {
    this.fov = clamp(this.fov + delta * 15, MIN_FOV, MAX_FOV);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  _releaseKeys() {
    for (const k in this.keys) this.keys[k] = 0;
  }

  _attach() {
    addEventListener('keydown', e => {
      this.keys[e.code] = 1;
      // Space: back on the corridor's middle, looking along it, level, unzoomed
      if (e.code === 'Space' && !e.repeat && !e.target.closest?.('input, textarea, select, [contenteditable]')) {
        e.preventDefault();
        this.recenter();
      }
    });
    addEventListener('keyup', e => {
      this.keys[e.code] = 0;
      if (e.key === 'Meta') this._releaseKeys();      // macOS swallows the keyup of anything pressed with ⌘
    });
    // a keyup lost to another window (a click outside, an app switch, a
    // shortcut) left a key held and the visitor walking on alone
    addEventListener('blur', () => this._releaseKeys());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._releaseKeys(); });

    // Mouse look by dragging: hold the button and move. No pointer lock, so the
    // cursor stays free for the toolbar and the first mouse event can never
    // jerk the camera into the floor. Spikes (tab switches, trackpad jumps)
    // are dropped. canvas.dragDist lets input.js tell a drag from a click.
    this.dragging = false;
    this.canvas.dragDist = 0;
    this.canvas.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.canvas.dragDist = 0;
    });
    addEventListener('mouseup', () => { this.dragging = false; });
    addEventListener('blur', () => { this.dragging = false; });
    addEventListener('mousemove', e => {
      if (!this.dragging || this.locked) return;
      const mx = e.movementX, my = e.movementY;
      if (Math.abs(mx) > 150 || Math.abs(my) > 150) return;
      this.canvas.dragDist += Math.abs(mx) + Math.abs(my);
      this.yaw -= mx * MOUSE_SENS;
      this.pitch = clamp(this.pitch - my * MOUSE_SENS, -PITCH_LIMIT, PITCH_LIMIT);
    });
  }

  update(dt) {
    if (this.locked) return; // inspect mode owns the camera; leave pos/yaw/pitch untouched

    // keys always work, on hands too: any walking key takes over from the hands
    const keyMove = MOVE_KEYS.some(k => this.keys[k]);
    if (keyMove && this.auto) this.auto = null;
    const onHands = this.hand.present && !keyMove;

    // ── yaw ──
    if (this.auto) {
      // something holds the walk and turns the view toward it, gently
      this.yaw += wrapAngle(this.auto.yaw - this.yaw) * Math.min(1, dt * 2.2);
      this.pitch += (0 - this.pitch) * Math.min(1, dt * 2.2);
      this._yawVel = 0;
    } else if (onHands) {
      // a pointing hand turns, but only without a fist: a fist walks straight.
      // The turn eases in and out, so a flicker of the hand is not a jolt
      const want = this.hand.anyFist ? 0 : this.hand.pointRight ? 1 : this.hand.pointLeft ? -1 : 0;
      this._yawVel += (want * HAND_YAW_RATE - this._yawVel) * Math.min(1, dt * HAND_YAW_EASE);
      this.yaw -= this._yawVel * dt;
    } else {
      // arrow-left/right turn the camera directly (independent of pointer-lock
      // mouse look, which stays optional) — A/D remain strafe below.
      const turn = (this.keys.ArrowRight ? 1 : 0) - (this.keys.ArrowLeft ? 1 : 0) + (this.drive?.x || 0);
      if (turn) this.yaw -= Math.max(-1, Math.min(1, turn)) * YAW_RATE * dt;
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
    if (this.auto) {
      walk = 0; strafe = 0;
    } else if (onHands) {
      walk = this.hand.anyFist ? 1 : 0;   // one fist walks, two run (below); anything else stops
      strafe = 0;
    } else {
      walk = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0) - (this.drive?.y || 0);
      walk = Math.max(-1, Math.min(1, walk));
      strafe = (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0);
    }

    this.intent = walk;
    this.eye += (this.eyeTarget - this.eye) * Math.min(1, dt * 1.2); // slow, dreamlike height change

    // heading basis (camera faces -Z at yaw 0)
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); // forward
    const rx = -fz, rz = fx;                                   // right
    let tx = fx * walk + rx * strafe;
    let tz = fz * walk + rz * strafe;
    const tl = Math.hypot(tx, tz);
    if (tl > 1) { tx /= tl; tz /= tl; }
    // run: Shift on the keyboard; holding the pad's ▲ for 1.5 s speeds up by
    // itself; both hand fists held long do the same
    this._walkT = walk > 0 ? (this._walkT || 0) + dt : 0;
    const running = this.keys.ShiftLeft || this.keys.ShiftRight || (onHands && this.hand.bothFists && walk > 0) ||
      ((this.keys.Pad || (this.drive && this.drive.y < -0.9)) && this._walkT > 1.5);
    const top = running ? RUN_SPEED : MAX_SPEED;
    const target = new THREE.Vector2(tx * top, tz * top);

    // soft accel toward target velocity
    const k = Math.min(1, ACCEL * dt);
    this.vel.x += (target.x - this.vel.x) * k;
    this.vel.y += (target.y - this.vel.y) * k;

    // ── integrate + collide ──
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.y + this.vel.y * dt;
    // on hands the walk keeps to the middle and the view settles along the way
    if (onHands && walk > 0 && dt > 0) {
      const r = this._rail(nx, nz);
      if (r) { nx += r.x * dt; nz += r.z * dt; }
      if (Math.abs(this._yawVel) < 0.1) {
        const axis = Math.round(this.yaw / (Math.PI / 2)) * (Math.PI / 2);
        this.yaw += wrapAngle(axis - this.yaw) * Math.min(1, dt * ALIGN_RATE);
      }
    }
    const resolved = this._collide(nx, nz);
    // kill velocity component lost to the wall (so accel doesn't build up into it)
    if (dt > 0) {
      const vx = (resolved.x - this.pos.x) / dt, vz = (resolved.z - this.pos.y) / dt;
      // the rail's own pull is not speed: keep only what the walk itself made
      this.vel.x = Math.abs(vx) < Math.abs(this.vel.x) + 1e-6 ? vx : this.vel.x;
      this.vel.y = Math.abs(vz) < Math.abs(this.vel.y) + 1e-6 ? vz : this.vel.y;
    }
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

  // How far each side of the heading's axis the walls stand; the correction
  // (a velocity, m/s) that brings the walk toward the middle between them.
  // Across a crossing, where one side stays open, there is nothing to hold to.
  _sides(x, z) {
    const alongX = Math.abs(Math.sin(this.yaw)) > Math.abs(Math.cos(this.yaw)); // heading mostly along ±X
    const px = alongX ? 0 : 1, pz = alongX ? 1 : 0;                            // the perpendicular
    const reach = sgn => {
      for (let d = 0.05; d <= RAIL_REACH; d += 0.05) if (!this.world.isWalkable(x + px * d * sgn, z + pz * d * sgn)) return d;
      return null;
    };
    return { px, pz, a: reach(1), b: reach(-1) };
  }

  _rail(x, z) {
    // Corridors (up to CORRIDOR_MAX wide) hold the walk to their middle,
    // measured a step or two ahead first: entering a corridor from a crossing
    // it is the corridor in front that has walls to hold to. In rooms and
    // crossings there is no middle to keep, only the walls to keep off.
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    for (const ahead of [1.5, 0.75, 0]) {
      const ax = x + fx * ahead, az = z + fz * ahead;
      if (!this.world.isWalkable(ax, az)) continue;
      const s = this._sides(ax, az);
      if (s.a == null || s.b == null || s.a + s.b > CORRIDOR_MAX) continue;
      // the middle across the way, measured there; how far off it we are here (+ toward side a)
      const off = x * s.px + z * s.pz - (ax * s.px + az * s.pz + (s.a - s.b) / 2);
      const beyond = Math.abs(off) > RAIL_PLAY ? off - Math.sign(off) * RAIL_PLAY : 0;
      const pull = -(off * RAIL_SOFT + beyond * RAIL_HARD);
      return { x: s.px * pull, z: s.pz * pull };
    }
    // the way ahead is wall, but an opening is just beside it: slide into it
    const alongX = Math.abs(fx) > Math.abs(fz), px = alongX ? 0 : 1, pz = alongX ? 1 : 0;
    const ax = x + fx * 1.2, az = z + fz * 1.2;
    if (!this.world.isWalkable(ax, az)) {
      for (let d = 0.1; d <= OPENING_REACH; d += 0.1) for (const sg of [1, -1]) {
        if (!this.world.isWalkable(ax + px * d * sg, az + pz * d * sg) || !this.world.isWalkable(x + px * d * sg, z + pz * d * sg)) continue;
        // go past the opening's edge by half a body, so the walk clears its corner
        const pull = sg * (d + RADIUS * 1.6) * RAIL_HARD * 0.6;
        return { x: px * pull, z: pz * pull };
      }
    }
    const s = this._sides(x, z);
    let push = 0;
    if (s.a != null && s.a < WALL_KEEP) push -= (WALL_KEEP - s.a) * RAIL_HARD;
    if (s.b != null && s.b < WALL_KEEP) push += (WALL_KEEP - s.b) * RAIL_HARD;
    return push ? { x: s.px * push, z: s.pz * push } : null;
  }

  // Space: whatever went astray, put it right. Back on the middle of the
  // corridor (or out of a wall, if the walk ever ended in one), looking
  // straight along it, level, unzoomed; a held board or painting lets go.
  recenter() {
    window.__app?.artworks?.inspecting && window.__app.artworks._closeInspect();
    this.auto = null;
    if (!this.world.isWalkable(this.pos.x, this.pos.y)) {
      const gi = Math.floor(this.pos.x / CELL), gj = Math.floor(this.pos.y / CELL);
      let best = null, bd = Infinity;
      for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
        const x = (gi + di + 0.5) * CELL, z = (gj + dj + 0.5) * CELL;
        const d = Math.hypot(x - this.pos.x, z - this.pos.y);
        if (d < bd && this.world.isWalkable(x, z)) { bd = d; best = { x, z }; }
      }
      if (best) this.pos.set(best.x, best.z);
    }
    this.yaw = Math.round(this.yaw / (Math.PI / 2)) * (Math.PI / 2);
    const s = this._sides(this.pos.x, this.pos.y);
    if (s.a != null && s.b != null) {
      const off = (s.b - s.a) / 2;
      this.pos.x -= s.px * off; this.pos.y -= s.pz * off;
    }
    this.vel.set(0, 0); this._yawVel = 0;
    this.pitch = 0;
    this.fov = MAX_FOV; this.camera.fov = MAX_FOV; this.camera.updateProjectionMatrix();
    this._apply();
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
    this.camera.position.set(this.pos.x, this.eye + bobY, this.pos.y);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}

function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function closestOnSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const len2 = vx * vx + vz * vz || 1e-9;
  let t = ((px - ax) * vx + (pz - az) * vz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + vx * t, z: az + vz * t };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
