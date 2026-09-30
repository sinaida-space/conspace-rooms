# MediaPipe Tasks Vision, vendored

Gesture mode and gallery mode track hands (and, in the gallery, notice a face)
with MediaPipe. Everything it needs is served from this folder, so the page
asks no other host for anything and the site's Content-Security-Policy can
stay at `'self'`.

| File | From |
|---|---|
| `0.10.14/vision_bundle.mjs`, `0.10.14/wasm/*` | the npm package `@mediapipe/tasks-vision@0.10.14` (`npm pack`), unchanged |
| `0.10.14/models/hand_landmarker.task` | `storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/` |
| `0.10.14/models/blaze_face_short_range.tflite` | `storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/` |

License: Apache License 2.0, © Google LLC (the same text as `LICENSE` at the
root of this repository). The models are published by Google under the same
license.

To move to a newer version: put it in a new folder named after the version
and change `MEDIAPIPE` in `src/hands.js`. The folder is cached for a year
(`vercel.json`), which is why the version is part of the path.
