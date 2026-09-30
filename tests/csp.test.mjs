import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCsp, readCsp, inlineScriptHashes } from '../tools/csp.mjs';

test('the policy in vercel.json allows exactly the inline scripts the pages carry', () => {
  assert.equal(readCsp(), buildCsp(), 'an inline script changed: run `node tools/csp.mjs --write`');
});

test('no page asks for a script, a style or a file from another host', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const root = new URL('..', import.meta.url);
  for (const file of readdirSync(root).filter(f => f.endsWith('.html'))) {
    const html = readFileSync(new URL(file, root), 'utf8');
    for (const [tag] of html.matchAll(/<(script|link|img|video|audio|source|iframe)\b[^>]*>/g)) {
      const url = tag.match(/\b(?:src|href)="(https?:)?\/\/[^"]+"/);
      if (!url) continue;
      assert.ok(/rel="(canonical|alternate|author|me)"/.test(tag), `${file}: ${tag}`);   // links that are only addresses, never fetched
    }
  }
});

test('the policy names no other host and no unsafe script source', () => {
  const csp = buildCsp();
  assert.ok(!/https?:/.test(csp), csp);
  assert.ok(!/script-src[^;]*'unsafe-(inline|eval)'/.test(csp), csp);
  assert.ok(inlineScriptHashes().length > 0);
});
