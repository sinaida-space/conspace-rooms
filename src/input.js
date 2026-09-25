// Input router: every mode emits the same events.
//   steer {x:-1..1, y:-1..1} · dive (±amount) · pick · halt
export class InputRouter {
  constructor() {
    this._h = { steer: [], dive: [], pick: [], halt: [] };
    this.mode = 'keys';
  }
  on(ev, cb) { this._h[ev].push(cb); }
  emit(ev, arg) { for (const cb of this._h[ev]) cb(arg); }

  attachKeyboardMouse(canvas) {
    const keys = {};
    const send = () => {
      const x = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
      const y = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
      this.emit('steer', { x, y });
    };
    addEventListener('keydown', e => {
      if (e.repeat) return;
      keys[e.code] = 1; send();
      if (e.code === 'KeyE' || e.code === 'Space') this.emit('pick');
      if (e.code === 'Escape') this.emit('halt');
    });
    addEventListener('keyup', e => { keys[e.code] = 0; send(); });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.emit('dive', e.deltaY > 0 ? 0.9 : -0.9);
    }, { passive: false });
    // a drag to look is not a click, and a finger tap is not a click either: on touch the pad's button inspects
    let finger = false;
    canvas.addEventListener('pointerdown', e => { finger = e.pointerType === 'touch'; });
    canvas.addEventListener('click', () => { if (!finger && (canvas.dragDist || 0) < 6) this.emit('pick'); });
  }

  // Touch on the canvas: two-finger pinch zooms. Walking and inspecting live
  // on the on-screen pad.
  attachTouch(canvas) {
    let pinchD = null;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 2) pinchD = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 2 && pinchD != null) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        this.emit('dive', (d - pinchD) * -0.02);
        pinchD = d;
      }
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      if (e.touches.length < 2) pinchD = null;
    });
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
