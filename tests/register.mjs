// Loaded before every test file (node --import). The site has no build step and
// no node_modules: `three` is an import-map name in the browser, so here a
// resolve hook points it at the vendored file. The seed is pinned the way
// ?seed=1224 pins it in the browser, so every run walks the same labyrinth.
import { register } from 'node:module';

globalThis.location = { search: '?seed=1224', hostname: 'localhost' };
register('./three-hook.mjs', import.meta.url);
