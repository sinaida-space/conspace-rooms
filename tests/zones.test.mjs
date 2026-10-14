import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONE, ORIGIN, zoneWeights, mixZone, SoulStage } from '../src/zones.js';

const sum = w => w.fear + w.memory + w.accept;
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('zone weights sum to one at every distance and move one way', () => {
  let prev = zoneWeights(ORIGIN.x, ORIGIN.z);
  for (let d = 0; d <= 260; d += 0.5) {
    const w = zoneWeights(ORIGIN.x + d, ORIGIN.z);
    assert.ok(near(sum(w), 1), `sum ${sum(w)} at ${d} m`);
    assert.ok(w.fear <= prev.fear + 1e-9 && w.accept >= prev.accept - 1e-9);
    prev = w;
  }
});

test('fear at the spawn, memory between the blends, acceptance beyond', () => {
  assert.equal(zoneWeights(ORIGIN.x, ORIGIN.z).fear, 1);
  assert.equal(zoneWeights(ORIGIN.x + (ZONE.MEM_B + ZONE.ACC_A) / 2, ORIGIN.z).memory, 1);
  assert.equal(zoneWeights(ORIGIN.x, ORIGIN.z + ZONE.ACC_B + 1).accept, 1);
});

test('mixZone blends the three colours by weight', () => {
  const target = { setRGB(r, g, b) { this.rgb = [r, g, b]; } };
  mixZone(target, { fear: 1, memory: 0, accept: 0 }, 0xff0000, 0x00ff00, 0x0000ff);
  assert.deepEqual(target.rgb, [1, 0, 0]);
  mixZone(target, { fear: 0, memory: 0.5, accept: 0.5 }, 0xff0000, 0x00ff00, 0x0000ff);
  assert.deepEqual(target.rgb, [0, 0.5, 0.5]);
});

test('the stage only moves forward through portals', () => {
  const s = new SoulStage();
  assert.equal(s.go(0), false);
  assert.equal(s.go(3), false);
  assert.equal(s.go(1), true);
  assert.equal(s.go(1), false);
  assert.equal(s.stage, 1);
});

test('a crossing blends over 2.5 s and the weights always sum to one', () => {
  const s = new SoulStage();
  s.go(1);
  assert.equal(s.weights().fear, 1);
  for (let i = 0; i < 25; i++) { s.update(0.1); assert.ok(near(sum(s.weights()), 1)); }
  const w = s.weights();
  assert.ok(near(w.memory, 1) && near(w.fear, 0));
});

test('the cheat can step back', () => {
  const s = new SoulStage();
  s.go(2);
  assert.equal(s.set(0), true);
  s.update(5);
  assert.equal(s.weights().fear, 1);
});
