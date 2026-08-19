// MediaPipe hand tracking → HandInput. Loaded lazily, only after the user
// explicitly chooses gesture mode (opt-in). All landmark processing stays in
// the browser; the model files are fetched from jsDelivr/Google CDN.
//
// iOS/iPadOS Safari constraints (do not regress these — see issue #13):
//   - the <video> element MUST be attached to document.body. iOS Safari
//     refuses to decode a detached video (currentTime stays 0 forever).
//     It stays visually invisible via near-zero size + opacity, NOT via
//     display:none/visibility:hidden/zero width-height — all three of
//     those also stop decode on iOS.
//   - playsInline/muted must be set as both DOM properties AND HTML
//     attributes (`setAttribute('playsinline', ...)`); iOS only reliably
//     honours the attribute form.
//   - the camera MediaStream is requested at click time by the caller
//     (see issue #12) and handed into start(stream) rather than requested
//     here — getUserMedia long after the user gesture is unreliable on iOS.
//   - the GPU delegate is unreliable in iOS Safari, so model creation
//     retries on the CPU delegate if GPU creation throws.
//
// Two-hand vocabulary (callers just read the flags on the emitted state):
//   both fists            → walk forward
//   right hand pointing    → turn right
//   left hand pointing     → turn left
//   both palms open (stop) → freezes turning/walking; moving the two open
//                            palms apart/together zooms in/out (zoomDelta)
//   thumb-index pinch (either hand) → inspect
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const NO_FRAMES_TIMEOUT_MS = 6000;
const WATCHDOG_TIMEOUT_MS = 8000;
const MAX_CONSECUTIVE_DETECT_FAILURES = 5;

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
  constructor(onUpdate, onError) {
    this.onUpdate = onUpdate;
    this.onError = onError;
    this.stopped = false;
    this._errored = false;
    this.lastVideoTime = -1;
    this._prevHandDist = null;
    this._failCount = 0;
    this._watchdogTimer = null;
    this._loop = this._loop.bind(this);
  }

  // Fire onError at most once, and never after stop().
  _fail(err) {
    if (this._errored || this.stopped) return;
    this._errored = true;
    this._clearWatchdog();
    if (this.onError) this.onError(err);
  }

  _clearWatchdog() {
    if (this._watchdogTimer) {
      clearTimeout(this._watchdogTimer);
      this._watchdogTimer = null;
    }
  }

  async start(stream) {
    // Video element must be created and attached to the DOM before the
    // stream is wired up — iOS Safari won't decode a detached video.
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('muted', '');
    Object.assign(this.video.style, {
      position: 'fixed', top: '0', left: '0',
      width: '1px', height: '1px', opacity: '0.01',
      pointerEvents: 'none', zIndex: '-1',
    });
    document.body.appendChild(this.video);

    try {
      this.stream = stream || await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
      });
      this.video.srcObject = this.stream;
      try {
        await this.video.play();
      } catch (e) {
        const err = new Error(`camera video failed to play: ${e.message || e}`);
        this._fail(err);
        throw err;
      }

      await this._waitForFrames();

      const vision = await import(`${CDN}/vision_bundle.mjs`);
      const files = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      const opts = d => ({ baseOptions: { modelAssetPath: MODEL_URL, delegate: d }, numHands: 2, runningMode: 'VIDEO' });
      try {
        this.lm = await vision.HandLandmarker.createFromOptions(files, opts('GPU'));
      } catch (e) {
        console.warn('[hands] GPU delegate failed, retrying on CPU', e);
        this.lm = await vision.HandLandmarker.createFromOptions(files, opts('CPU'));
      }

      this._armWatchdog();
      requestAnimationFrame(this._loop);
    } catch (e) {
      this._fail(e instanceof Error ? e : new Error(String(e)));
      throw e;
    }
  }

  // Resolves once the video is actually decoding real frames. iOS can leave
  // readyState/videoWidth at 0 indefinitely if decode never started, so this
  // times out rather than hanging forever.
  _waitForFrames() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.video.removeEventListener('loadedmetadata', check);
        this.video.removeEventListener('loadeddata', check);
        clearTimeout(timer);
        resolve();
      };
      const check = () => {
        if (settled) return;
        if (this.video.readyState >= 2 && this.video.videoWidth > 0) {
          finish();
        } else {
          requestAnimationFrame(check);
        }
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.video.removeEventListener('loadedmetadata', check);
        this.video.removeEventListener('loadeddata', check);
        reject(new Error('camera stream produced no frames'));
      }, NO_FRAMES_TIMEOUT_MS);
      this.video.addEventListener('loadedmetadata', check);
      this.video.addEventListener('loadeddata', check);
      requestAnimationFrame(check);
    });
  }

  _armWatchdog() {
    this._clearWatchdog();
    this._watchdogTimer = setTimeout(() => {
      this._watchdogTimer = null;
      this._fail(new Error('hand tracking produced no results'));
    }, WATCHDOG_TIMEOUT_MS);
  }

  _loop(now) {
    if (this.stopped) return;
    if (this.video.videoWidth === 0) {
      requestAnimationFrame(this._loop);
      return;
    }
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;

      let res;
      try {
        res = this.lm.detectForVideo(this.video, now);
        this._failCount = 0;
      } catch (e) {
        this._failCount++;
        console.warn('[hands] detectForVideo failed', e);
        if (this._failCount >= MAX_CONSECUTIVE_DETECT_FAILURES) {
          this._fail(e instanceof Error ? e : new Error(String(e)));
          return;
        }
        requestAnimationFrame(this._loop);
        return;
      }

      // Re-arm rather than clear: a stream that freezes after working for a
      // while stops producing new currentTime values, so the loop stops
      // detecting and the sliding watchdog fires the fallback.
      this._armWatchdog();

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
          // already matches the user's physical hand.
          const rawLabel = res.handednesses?.[i]?.[0]?.categoryName;
          const side = rawLabel === 'Left' ? 'left' : 'right';
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
    if (this.stopped) return;
    this.stopped = true;
    this._clearWatchdog();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.lm) this.lm.close();
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      if (this.video.parentNode) this.video.parentNode.removeChild(this.video);
    }
  }
}
