// Single source of truth for device/input classification. Replaces the
// duplicated UA-sniffing regexes previously scattered across ui.js and
// quality.js. iPadOS 13+ reports UA `Macintosh` and is only distinguishable
// from a real Mac via touch point count, so width/screen-size heuristics are
// deliberately avoided here.
export function detectDevice() {
  const ua = navigator.userAgent;
  const maxTouch = navigator.maxTouchPoints || 0;

  let coarsePointer = false;
  try { coarsePointer = matchMedia('(pointer: coarse)').matches; } catch (e) { coarsePointer = false; }

  const isIPadOS = maxTouch > 1 && /Macintosh/.test(ua);
  const isIOS = /iPhone|iPod|iPad/.test(ua) || isIPadOS;
  const isPhone = /Mobi|Android|iPhone|iPod/.test(ua) && !/iPad/.test(ua) && !isIPadOS;
  const isTablet = !isPhone && (isIPadOS || /iPad/.test(ua) || (/Android/.test(ua) && !/Mobi/.test(ua)) || (coarsePointer && maxTouch > 1));
  const isMobile = isPhone || isTablet;
  const isTouch = maxTouch > 0 || 'ontouchstart' in window;
  const hasCamera = !!navigator.mediaDevices?.getUserMedia;
  const secureContext = window.isSecureContext === true;

  return { isTouch, isIOS, isIPadOS, isPhone, isTablet, isMobile, hasCamera, secureContext, coarsePointer };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
