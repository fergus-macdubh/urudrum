export type Point2 = readonly [number, number];

/**
 * Chaikin corner cutting: replace every corner with two points a quarter in from each side,
 * repeatedly. The polyline converges on a quadratic B-spline, so a handful of passes turns
 * an angular route into smooth arcs while keeping its overall shape.
 *
 * Chosen over a Catmull-Rom spline through the same waypoints because Catmull-Rom must pass
 * *through* every control point, so a 90-degree corner stays a visibly tight pivot. Cutting
 * the corner away is what actually produces the wide, lazy bends we want, and it can never
 * overshoot or loop the way an interpolating spline can on a sharp turn.
 *
 * The trade: the curve no longer touches the authored waypoints, and the route gets shorter
 * as corners are rounded off. Both matter — the lane is what tower ranges are measured
 * against — so the build pads are positioned against the smoothed result, not the controls.
 */
export function chaikin(points: ReadonlyArray<Point2>, iterations: number): Point2[] {
  let current: Point2[] = points.map(([x, y]) => [x, y] as Point2);

  for (let pass = 0; pass < iterations; pass++) {
    const next: Point2[] = [current[0]!];

    for (let i = 0; i < current.length - 1; i++) {
      const [ax, ay] = current[i]!;
      const [bx, by] = current[i + 1]!;
      // The classic 1/4 and 3/4 split along each edge.
      next.push([ax + (bx - ax) * 0.25, ay + (by - ay) * 0.25]);
      next.push([ax + (bx - ax) * 0.75, ay + (by - ay) * 0.75]);
    }

    // Endpoints are kept so the lane still enters and leaves exactly where it should.
    next.push(current[current.length - 1]!);
    current = next;
  }

  return current;
}
