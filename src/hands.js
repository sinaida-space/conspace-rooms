// MediaPipe hand tracking → HandInput. Loaded lazily, only after the user
// explicitly chooses gesture mode (opt-in). All landmark processing stays in
// the browser; the model files are fetched from jsDelivr/Google CDN.
//
// Two-hand vocabulary (callers just read the flags on the emitted state):
//   both fists            → walk forward
//   right hand pointing    → turn right
//   left hand pointing     → turn left
//   both palms open (stop) → freezes turning/walking; moving the two open
//                            palms apart/together zooms in/out (zoomDelta)
//   thumb-index pinch (either hand) → inspect
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) || 0); }

// Classify a single hand's landmarks into the gesture primitives we care
// about. Landmark indices follow MediaPipe's 21-point hand model.
function classifyHand(l) {
  const wrist = l[0], mcp = l[9];
  const size = dist(wrist, mcp) || 1e-4; // scale reference
  const isCurled = t => dist(l[t], wrist) < dist(l[t - 2], wrist) + size * 0.1;
  const indexOut = !isCurled(8), middleOut = !isCurled(12), ringOut = !isCurled(16), pinkyOut = !isCurled(20);
  return {
    fist: !indexOut && !middleOut && !ringOut && !pinkyOut,
    openPalm: indexOut && middleOut && ringOut && pinkyOut,
    pointing: indexOut && !middleOut && !ringOut && !pinkyOut, // index-only "point" gesture
    pinch: dist(l[4], l[8]) < size * 0.5,
    center: mcp,
  };
}

export class HandInput {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.stopped = false;
    this.lastVideoTime = -1;
    this._prevHandDist = null;
    this._loop = this._loop.bind(this);
  }

  async start() {
    const vision = await import(`${CDN}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    this.lm = await vision.HandLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      numHands: 2, runningMode: 'VIDEO',
    });

    this.video = document.createElement('video');
    this.video.playsInline = true; this.video.muted = true;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    requestAnimationFrame(this._loop);
  }

  _loop(now) {
    if (this.stopped) return;
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const res = this.lm.detectForVideo(this.video, now);
      const n = res.landmarks ? res.landmarks.length : 0;

      if (n === 0) {
        this._prevHandDist = null;
        this.onUpdate({
          present: false, bothFists: false, pointLeft: false, pointRight: false,
          stopped: false, pinch: false, zoomDelta: 0,
        });
      } else {
        let left = null, right = null, anyPinch = false;
        for (let i = 0; i < n; i++) {
          const g = classifyHand(res.landmarks[i]);
          if (g.pinch) anyPinch = true;
          // MediaPipe's handedness label assumes a mirrored (selfie) input
          // frame; our raw getUserMedia frame isn't mirrored, so the label
          // is the opposite of the user's physical hand — swap it back.
          const rawLabel = res.handednesses?.[i]?.[0]?.categoryName;
          const side = rawLabel === 'Left' ? 'right' : 'left';
          if (side === 'left' && !left) left = g;
          else if (side === 'right' && !right) right = g;
        }

        const bothFists = !!(left?.fist && right?.fist);
        const bothOpen = !!(left?.openPalm && right?.openPalm);
        const pointLeft = !!left?.pointing;
        const pointRight = !!right?.pointing;

        let zoomDelta = 0;
        if (bothOpen && left && right) {
          const d = dist(left.center, right.center);
          if (this._prevHandDist != null) zoomDelta = d - this._prevHandDist;
          this._prevHandDist = d;
        } else {
          this._prevHandDist = null;
        }

        this.onUpdate({
          present: true, bothFists, pointLeft, pointRight,
          stopped: bothOpen, pinch: anyPinch, zoomDelta,
        });
      }
    }
    requestAnimationFrame(this._loop);
  }

  stop() {
    this.stopped = true;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.lm) this.lm.close();
  }
}
