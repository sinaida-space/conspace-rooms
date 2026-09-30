import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CELL, CHUNK, CHUNK_M, CONSPACE_SEED, hash2i, mulberry32, chunkRooms, cellSolidLocal,
  solidAtGlobal, wallSlots, isLampCell, World,
} from '../src/world.js';

const BAND = [4, 5, 10, 11];
const RANGE = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const eachChunk = fn => { for (const cx of RANGE) for (const cz of RANGE) fn(cx, cz); };
const fakeScene = () => ({ added: 0, removed: 0, add() { this.added++; }, remove() { this.removed++; } });

test('?seed pins the labyrinth', () => {
  assert.equal(CONSPACE_SEED, 1224);
});

test('hash2i is a stable uint32 that tells neighbours apart', () => {
  const h = hash2i(1224, 3, -7);
  assert.equal(h, hash2i(1224, 3, -7));
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
  assert.notEqual(h, hash2i(1224, 4, -7));
  assert.notEqual(h, hash2i(1224, 3, -6));
  assert.notEqual(h, hash2i(1225, 3, -7));
});

test('mulberry32 repeats for a seed and stays in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('rooms: one to three per chunk, inside it, each across a corridor band both ways', () => {
  eachChunk((cx, cz) => {
    const rooms = chunkRooms(cx, cz);
    assert.ok(rooms.length >= 1 && rooms.length <= 3);
    for (const r of rooms) {
      assert.ok(r.x0 >= 0 && r.y0 >= 0 && r.x1 < CHUNK && r.y1 < CHUNK, `room leaves chunk ${cx}:${cz}`);
      const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
      assert.ok(w >= 4 && w <= 9 && h >= 4 && h <= 9);
      assert.ok([4, 10].some(b => b >= r.x0 && b <= r.x1), 'no band column inside the room');
      assert.ok([4, 10].some(b => b >= r.y0 && b <= r.y1), 'no band row inside the room');
    }
  });
});

test('the corridor lattice is open in every chunk, so chunk edges always stitch', () => {
  eachChunk((cx, cz) => {
    for (const b of BAND) for (let k = 0; k < CHUNK; k++) {
      assert.equal(cellSolidLocal(cx, cz, b, k), false);
      assert.equal(cellSolidLocal(cx, cz, k, b), false);
    }
  });
});

test('global and local solidity agree, negative coordinates too', () => {
  eachChunk((cx, cz) => {
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      assert.equal(solidAtGlobal(cx * CHUNK + i, cz * CHUNK + j), cellSolidLocal(cx, cz, i, j));
    }
  });
});

test('wall slots: two cells or longer, open in front, solid behind, along the whole run', () => {
  let seen = 0;
  eachChunk((cx, cz) => {
    const keys = new Set();
    for (const s of wallSlots(cx, cz)) {
      seen++;
      assert.ok(s.length >= 2);
      assert.ok(!keys.has(s.cellKey), `duplicate slot ${s.cellKey}`);
      keys.add(s.cellKey);
      const { x, z } = s.position, nx = s.normal.x, nz = s.normal.z;
      assert.equal(Math.abs(nx) + Math.abs(nz), 1);
      const tx = -nz, tz = nx;
      for (let k = 0; k < s.length; k++) {
        const along = (k - (s.length - 1) / 2) * CELL;
        const px = x + tx * along, pz = z + tz * along;
        const front = solidAtGlobal(Math.floor((px + nx * 0.6) / CELL), Math.floor((pz + nz * 0.6) / CELL));
        const back = solidAtGlobal(Math.floor((px - nx * 0.6) / CELL), Math.floor((pz - nz * 0.6) / CELL));
        assert.equal(front, false, `slot ${s.cellKey}: no room to stand in front`);
        assert.equal(back, true, `slot ${s.cellKey}: no wall behind`);
      }
    }
  });
  assert.ok(seen > 500, 'suspiciously few wall slots');
});

test('lamps hang on the lamp lines only', () => {
  assert.equal(isLampCell(1, 1), true);
  assert.equal(isLampCell(5, 11), true);
  assert.equal(isLampCell(-11, 5), true);   // -11 mod 16 = 5
  assert.equal(isLampCell(2, 5), false);
  assert.equal(isLampCell(5, 6), false);
});

test('a chunk is rebuilt byte for byte', () => {
  const a = new World(fakeScene()), b = new World(fakeScene());
  const ga = a._buildChunk(2, -3), gb = b._buildChunk(2, -3);
  assert.equal(ga.children.length, gb.children.length);
  ga.children.forEach((mesh, i) => {
    for (const name of Object.keys(mesh.geometry.attributes)) {
      assert.deepEqual(mesh.geometry.attributes[name].array, gb.children[i].geometry.attributes[name].array, name);
    }
  });
});

test('chunk geometry: whole triangles, every attribute as long as the positions', () => {
  const group = new World(fakeScene())._buildChunk(0, 0);
  assert.equal(group.children.length, 3);   // floor, ceiling, walls
  for (const mesh of group.children) {
    const at = mesh.geometry.attributes, n = at.position.count;
    assert.ok(n > 0 && n % 3 === 0);
    for (const name of Object.keys(at)) assert.equal(at[name].count, n, name);
  }
});

test('streaming keeps the number of chunks flat over a long walk', () => {
  const scene = fakeScene(), world = new World(scene);
  world.update(5.4, 5.4);
  assert.equal(world.chunks.size, 25);
  for (let step = 1; step <= 12; step++) {
    world.update(5.4 + step * CHUNK_M, 5.4 + Math.floor(step / 3) * CHUNK_M);
    assert.ok(world.chunks.size <= 49, `chunks grew to ${world.chunks.size}`);
    assert.equal(scene.added - scene.removed, world.chunks.size);
  }
});

test('the spawn is walkable and its walls face inward', () => {
  const world = new World(fakeScene());
  assert.equal(world.isWalkable(5.4, 5.4), true);
  for (const s of world.wallSegmentsNear(5.4, 5.4)) {
    assert.equal(Math.abs(s.nx) + Math.abs(s.nz), 1);
    const mx = (s.a.x + s.b.x) / 2, mz = (s.a.z + s.b.z) / 2;
    assert.equal(world.isWalkable(mx + s.nx * 0.6, mz + s.nz * 0.6), true);
    assert.equal(world.isWalkable(mx - s.nx * 0.6, mz - s.nz * 0.6), false);
  }
});
