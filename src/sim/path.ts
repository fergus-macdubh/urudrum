import type { Vec2 } from "./vec";

export interface PathSample extends Vec2 {
  /** Heading in radians at this point along the path. */
  angle: number;
}

/**
 * A polyline walked by distance rather than by waypoint index. Enemies store a single
 * scalar `travelled`, which makes "who is furthest along?" a trivial comparison — exactly
 * what first-in-path tower targeting needs.
 */
export class Path {
  readonly points: ReadonlyArray<Vec2>;
  /** Cumulative distance at each point; `cumulative[i]` is the distance from the start to `points[i]`. */
  private readonly cumulative: number[];
  readonly length: number;

  constructor(points: ReadonlyArray<readonly [number, number]>) {
    if (points.length < 2) {
      throw new Error("Path needs at least two points");
    }
    this.points = points.map(([x, y]) => ({ x, y }));

    this.cumulative = [0];
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]!;
      const b = this.points[i]!;
      this.cumulative.push(this.cumulative[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.length = this.cumulative[this.cumulative.length - 1]!;
  }

  /** Position and heading at `travelled` px from the start. Clamps at both ends. */
  sample(travelled: number): PathSample {
    const d = Math.max(0, Math.min(travelled, this.length));

    // Binary search for the segment containing `d`. This used to be a linear scan, which was
    // fine for the ten authored waypoints; the lane is now a smoothed polyline of ~145
    // points, and the scan is on the hot path for every enemy every tick — and for thousands
    // of full games during a headless balance sweep.
    let lo = 0;
    let hi = this.cumulative.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cumulative[mid]! <= d) lo = mid;
      else hi = mid - 1;
    }
    const seg = lo;

    const a = this.points[seg]!;
    const b = this.points[seg + 1]!;
    const segStart = this.cumulative[seg]!;
    const segLength = this.cumulative[seg + 1]! - segStart;
    const t = segLength > 0 ? (d - segStart) / segLength : 0;

    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }
}
