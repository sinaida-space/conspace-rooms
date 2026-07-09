// MediaPipe hand tracking → HandInput. Loaded lazily, only after the user
// explicitly chooses gesture mode (opt-in). All landmark processing stays in
// the browser; the model files are fetched from jsDelivr/Google CDN.
// No movement mapping here — callers decide what palmX/fist/pinch/present mean.
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) || 0); }

export class HandInput {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.stopped = false;
    this.lastVideoTime = -1;
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
      numHands: 1, runningMode: 'VIDEO',
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
      const l = res.landmarks && res.landmarks[0];
      if (l) {
        const wrist = l[0], mcp = l[9];
        const size = dist(wrist, mcp) || 1e-4; // scale reference
        const isCurled = t => dist(l[t], wrist) < dist(l[t - 2], wrist) + size * 0.1;
        const fist = isCurled(8) && isCurled(12) && isCurled(16) && isCurled(20);
        const pinch = dist(l[4], l[8]) < size * 0.5;
        const palmX = Math.max(-1, Math.min(1, (l[9].x - 0.5) * 2));
        this.onUpdate({ palmX, fist, pinch, present: true });
      } else {
        this.onUpdate({ palmX: 0, fist: false, pinch: false, present: false });
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
