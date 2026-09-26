// Input router: every mode emits the same events.
//   steer {x:-1..1, y:-1..1} · dive (±amount) · pick · halt
//   drive {x, y}: a finger held and dragged on a touch screen (see attachTouch)
export class InputRouter {
  constructor() {
    this._h = { steer: [], dive: [], pick: [], halt: [], drive: [] };
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

  // Touch on the canvas: hold a finger anywhere and drag, and you move the way
  // you drag: up walks forward, down walks back, sideways turns, further
  // means faster. A small ring marks where the finger went down. Two fingers
  // pinch to zoom instead.
  attachTouch(canvas) {
    const R = 64;                                       // px of drag for full speed
    const ring = document.createElement('div');
    ring.id = 'drag-ring'; ring.innerHTML = '<i></i>';
    document.body.appendChild(ring);
    const dot = ring.firstChild;
    let pinchD = null, id = null, ox = 0, oy = 0;
    const stop = () => { id = null; ring.classList.remove('on'); this.emit('drive', { x: 0, y: 0 }); };
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        stop();
        pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        id = t.identifier; ox = t.clientX; oy = t.clientY;
        ring.style.left = ox + 'px'; ring.style.top = oy + 'px';
        dot.style.transform = 'translate(-50%, -50%)';
        ring.classList.add('on');
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 2 && pinchD != null) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        this.emit('dive', (d - pinchD) * -0.02);
        pinchD = d;
        return;
      }
      const t = [...e.touches].find(t => t.identifier === id);
      if (!t) return;
      let dx = t.clientX - ox, dy = t.clientY - oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      dot.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const dead = v => (Math.abs(v) < 0.18 ? 0 : v);   // a trembling thumb stays still
      this.emit('drive', { x: dead(dx / R), y: dead(dy / R) });
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      if (e.touches.length < 2) pinchD = null;
      if (![...e.touches].some(t => t.identifier === id)) stop();
    });
    canvas.addEventListener('touchcancel', stop);
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
