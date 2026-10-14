import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CELL, wallSlots } from '../src/world.js';
import { wallBehind, mountOrDrop } from '../src/placement.js';

// a long wall run near the spawn to hang things on
const slot = wallSlots(0, 0).find(s => s.length >= 4);
const { x, z } = slot.position, nx = slot.normal.x, nz = slot.normal.z;
const plate = () => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3));
  m.position.set(x, 1.5, z);
  return m;
};

test('wallBehind: true on a wall face, false in the open', () => {
  assert.equal(wallBehind(x, z, nx, nz), true);
  assert.equal(wallBehind(x + nx * CELL, z + nz * CELL, nx, nz), false);
});

test('wallBehind with a room\'s own wall segments', () => {
  const walls = [{ a: { x: 0, z: 0 }, b: { x: 2, z: 0 } }];
  assert.equal(wallBehind(1, 0.01, 0, 1, 0.03, { walls }), true);
  assert.equal(wallBehind(1, 0.5, 0, 1, 0.03, { walls }), false);
  assert.equal(wallBehind(2.5, 0, 0, 1, 0.03, { walls }), false);
});

test('a thing with a wall behind it stays as built', () => {
  const m = plate(), before = m.rotation.clone();
  assert.equal(mountOrDrop(m, { x, z, nx, nz, w: 0.2 }), 'wall');
  assert.ok(m.rotation.equals(before));
  assert.equal(m.position.y, 1.5);
});

test('a thing with no wall behind it lies on the floor, 2 cm above it', () => {
  const m = plate();
  m.position.set(x + nx * CELL, 1.5, z + nz * CELL);
  assert.equal(mountOrDrop(m, { x: m.position.x, z: m.position.z, nx, nz }), 'floor');
  m.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(m);
  assert.ok(Math.abs(box.min.y - 0.02) < 1e-6, `lowest point at ${box.min.y}`);
  assert.ok(box.max.y < 0.1, 'it should lie flat');
});

test('a thing wider than its wall falls', () => {
  const walls = [{ a: { x: 0, z: 0 }, b: { x: 2, z: 0 } }];   // a free-standing wall 2 m long, facing +z
  const at = { x: 1, z: 0, nx: 0, nz: 1, walls };
  assert.equal(mountOrDrop(plate(), { ...at, w: 0.9 }), 'wall');
  assert.equal(mountOrDrop(plate(), { ...at, w: 1.5 }), 'floor');
});

test('a fallen thing is recorded on the floor and left where it lies', () => {
  const m = plate();
  m.position.y = 0.05;
  const before = m.rotation.clone();
  assert.equal(mountOrDrop(m, { x, z, nx, nz, fallen: true }), 'floor');
  assert.ok(m.rotation.equals(before));
  assert.equal(m.position.y, 0.05);
});
