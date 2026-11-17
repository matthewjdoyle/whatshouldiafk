import assert from 'node:assert/strict';
import test from 'node:test';
import { findClosestPoint, getIconPoints, groupCoincidentPoints } from '../src/components/graph/scatterPoints.ts';

test('only exactly coincident coordinates share a spot; nearby points are not combined or displaced', () => {
  const points = Object.freeze([
    Object.freeze({ id: 'a', left: 20, top: 30 }),
    Object.freeze({ id: 'b', left: 20, top: 30 }),
    Object.freeze({ id: 'near-x', left: 20 + 1e-9, top: 30 }),
    Object.freeze({ id: 'near-y', left: 20, top: 30 + 1e-9 }),
    Object.freeze({ id: 'far', left: 400, top: 500 }),
  ]);
  const spots = groupCoincidentPoints(points);
  assert.equal(spots.length, 4);
  assert.deepEqual(spots[0], { left: 20, top: 30, members: [points[0], points[1]] });
  for (const spot of spots) {
    for (const point of spot.members) {
      assert.strictEqual(point, points.find(original => original.id === point.id));
      assert.equal(spot.left, point.left);
      assert.equal(spot.top, point.top);
    }
  }
});

test('coincident groups retain every method in deterministic input order', () => {
  const points = Array.from({ length: 88 }, (_, index) => ({ id: index, left: index % 2, top: 10 }));
  const spots = groupCoincidentPoints(points);
  assert.equal(spots.length, 2);
  assert.deepEqual(spots[0].members, points.filter(point => point.left === 0));
  assert.deepEqual(spots[1].members, points.filter(point => point.left === 1));
  assert.equal(spots.flatMap(spot => spot.members).length, points.length);
});

test('nearest-point picking reaches close distinct dots without moving them', () => {
  const points = [{ left: 10, top: 20 }, { left: 11, top: 20 }, { left: 11, top: 21 }];
  for (const point of points) assert.strictEqual(findClosestPoint(points, point.left, point.top, 14), point);
  assert.strictEqual(findClosestPoint(points, 10.6, 20, 14), points[1]);
  assert.strictEqual(findClosestPoint(points, 10.5, 20, 14), points[0]);
  assert.strictEqual(findClosestPoint(points, 11, 22, 1), points[2]);
  assert.equal(findClosestPoint(points, 100, 100, 14), null);
});

test('idle icons only appear where square icon footprints have enough clearance', () => {
  const crowded = [{ left: 0, top: 0 }, { left: 33, top: 0 }, { left: 0, top: 33 }];
  const isolated = { left: 100, top: 100 };
  const points = Object.freeze([...crowded, isolated].map(point => Object.freeze(point)));
  assert.deepEqual([...getIconPoints(points, 28, 6)], [isolated]);
  assert.deepEqual(points.map(point => [point.left, point.top]), [[0, 0], [33, 0], [0, 33], [100, 100]]);
  assert.deepEqual([...getIconPoints([{ left: 0, top: 0 }, { left: 34, top: 0 }], 28, 6)].length, 2);
  assert.equal(getIconPoints([{ left: 0, top: 0 }, { left: 25, top: 25 }], 28, 6).size, 0, 'Diagonal square icons must not overlap');
});

test('coincident points stay dots even when their shared location is otherwise isolated', () => {
  const points = [{ left: 10, top: 20 }, { left: 10, top: 20 }, { left: 100, top: 100 }];
  assert.deepEqual([...getIconPoints(points, 28, 6)], [points[2]]);
});

test('idle icon eligibility follows resized coordinates and filtered neighbors', () => {
  const wide = [{ left: 0, top: 0 }, { left: 50, top: 0 }];
  assert.equal(getIconPoints(wide, 28, 6).size, 2);
  const narrow = wide.map(point => ({ ...point, left: point.left / 2 }));
  assert.equal(getIconPoints(narrow, 28, 6).size, 0);
  assert.deepEqual([...getIconPoints([narrow[0]], 28, 6)], [narrow[0]]);
  assert.equal(getIconPoints([], 28, 6).size, 0);
});

test('empty graphs have neither a spot nor a hovered point', () => {
  assert.deepEqual(groupCoincidentPoints([]), []);
  assert.equal(findClosestPoint([], 10, 20, 14), null);
});
