interface Position {
  left: number;
  top: number;
}

export interface ScatterSpot<T> extends Position {
  members: T[];
}

export function groupCoincidentPoints<T extends Position>(points: T[]): ScatterSpot<T>[] {
  const columns = new Map<number, Map<number, ScatterSpot<T>>>();
  const spots: ScatterSpot<T>[] = [];
  for (const point of points) {
    let column = columns.get(point.left);
    if (!column) {
      column = new Map();
      columns.set(point.left, column);
    }
    const spot = column.get(point.top);
    if (spot) spot.members.push(point);
    else {
      const next = { left: point.left, top: point.top, members: [point] };
      column.set(point.top, next);
      spots.push(next);
    }
  }
  return spots;
}

export function getIconPoints<T extends Position>(points: T[], iconSize: number, gap: number): Set<T> {
  const clearance = iconSize + gap;
  return new Set(points.filter((point, index) => points.every((other, otherIndex) =>
    index === otherIndex || Math.abs(point.left - other.left) >= clearance || Math.abs(point.top - other.top) >= clearance,
  )));
}

// Nearest-point picking keeps close dots reachable without overlapping hit boxes
// choosing the topmost button, or changing any plotted coordinates.
export function findClosestPoint<T extends Position>(points: T[], left: number, top: number, radius: number): T | null {
  let closest: T | null = null;
  let distance = radius * radius;
  for (const point of points) {
    const next = (point.left - left) ** 2 + (point.top - top) ** 2;
    if (next < distance || (closest === null && next === distance)) {
      closest = point;
      distance = next;
    }
  }
  return closest;
}
