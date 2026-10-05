// The site's Content-Security-Policy, built from the pages themselves: every
// inline script (the mirror redirect, the import map, the small module tags)
// is allowed by the hash of its text and by nothing looser. After editing an
// inline script in any HTML page, run
//
//   node tools/csp.mjs --write
//
// and vercel.json takes the new policy; tests/csp.test.mjs fails until then.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function inlineScriptHashes() {
  const hashes = new Set();
  for (const file of readdirSync(ROOT).filter(f => f.endsWith('.html')).sort()) {
    const html = readFileSync(ROOT + file, 'utf8');
    for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\bsrc=/.test(attrs) || /application\/ld\+json/.test(attrs) || !body.trim()) continue;   // files are 'self'; JSON-LD is data, never run
      hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
    }
  }
  return [...hashes].sort();
}

export function buildCsp() {
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval': the hand tracker is WebAssembly (vendor/mediapipe), compiled in the browser
    `script-src 'self' 'wasm-unsafe-eval' ${inlineScriptHashes().join(' ')}`,
    "style-src 'self' 'unsafe-inline'",          // styles set from the scripts (menus, the games, the card)
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "frame-src https://www.youtube-nocookie.com",   // for the press.html video facade, which mounts the player only after a click; the header itself covers every page
    "connect-src 'self' blob:",                  // the models' own textures are read back as blobs (GLTFLoader)
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function readCsp() {
  const config = JSON.parse(readFileSync(ROOT + 'vercel.json', 'utf8'));
  return config.headers.find(h => h.source === '/(.*)')?.headers.find(h => h.key === 'Content-Security-Policy')?.value;
}

if (process.argv.includes('--write')) {
  const path = ROOT + 'vercel.json', raw = readFileSync(path, 'utf8'), config = JSON.parse(raw);
  config.headers.find(h => h.source === '/(.*)').headers.find(h => h.key === 'Content-Security-Policy').value = buildCsp();
  writeFileSync(path, JSON.stringify(config, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log('vercel.json: Content-Security-Policy updated');
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(buildCsp());
}

// Je suis le spectre d'une rose que tu portais hier au bal.
