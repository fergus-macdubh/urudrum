import { BUILD_SLOTS, DEPOT, PATH_POINTS, VIEW } from "../sim/config";
import { Path } from "../sim/path";
import { C } from "./palette";

/**
 * Every sprite in the game is drawn here with the Canvas 2D API at boot — there is not a
 * single binary asset in the project.
 *
 * These are deliberate placeholders, not final art: consistent palette, warm outlines,
 * readable silhouettes. When real hand-painted sprites arrive, this file is replaced by a
 * texture-atlas load and nothing else in the game has to change.
 */

export interface GeneratedTexture {
  key: string;
  canvas: HTMLCanvasElement;
}

const TAU = Math.PI * 2;

/** Geometry of the lane as it is drawn. The simulation only knows the centre line. */
const ROAD_HALF = 36;

/**
 * Base outline weight — the single dial for how heavily inked the whole map is.
 *
 * The reference art sits around 2-3px of outline on a 2000px-wide image; our canvas is
 * 1280px, so the equivalent is roughly 1.5-2px. Everything used to be hard-coded at 3-5px,
 * about three times too fat, and heavy ink is what was swallowing all the small detail.
 * Every stroke below is expressed as a multiple of this.
 */
const INK = 2;
const EDGE_OUTLINE = INK;

/**
 * Units carry a little more ink than scenery. A grunt is a 40px sprite moving over busy
 * ground; inked as lightly as a 200px tree it turns to mush.
 */
const INK_UNIT = INK * 1.25;
/** Interior detail — thatch combing, crate slats, ruled lines on signs. */
const INK_FINE = INK * 0.75;

const LANE = new Path(PATH_POINTS);

interface Pt {
  x: number;
  y: number;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return [canvas, ctx];
}

/** Deterministic noise so the terrain looks identical on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Smooth 1D value noise in [-1, 1], from a repeating table of random values.
 *
 * Used wherever an outline should wobble organically. A sine wave is the obvious choice and
 * the wrong one at small scale: regular teeth at a regular pitch read as a machined comb,
 * which looks worse than a coarse edge. Noise at the same scale reads as a hand-inked line.
 */
function makeNoise1D(seed: number): (x: number) => number {
  const rand = mulberry32(seed);
  const table = Array.from({ length: 256 }, () => rand() * 2 - 1);

  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const smooth = f * f * (3 - 2 * f);
    const a = table[((i % 256) + 256) % 256]!;
    const b = table[((((i + 1) % 256) + 256) % 256)]!;
    return a + (b - a) * smooth;
  };
}

function outlined(
  ctx: CanvasRenderingContext2D,
  draw: () => void,
  fill: string,
  lineWidth = INK,
  stroke: string = C.outline,
): void {
  ctx.beginPath();
  draw();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.lineJoin = "round";
  ctx.stroke();
}

/**
 * Fills the union of a set of circles in one go.
 *
 * Drawing them one at a time with individual outlines would leave the internal arcs visible
 * where they overlap. Collecting every circle into a single path and filling once means only
 * the outer silhouette shows — which is how the outline/fill pairs below build a clean
 * scalloped border out of nothing but overlapping discs.
 */
function unionCircles(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<Pt>,
  radius: number,
  fill: string,
): void {
  ctx.beginPath();
  for (const p of points) {
    ctx.moveTo(p.x + radius, p.y);
    ctx.arc(p.x, p.y, radius, 0, TAU);
  }
  ctx.fillStyle = fill;
  ctx.fill();
}

function tracePath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  PATH_POINTS.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
}

/** Shortest distance from a point to the lane centre line. */
function distanceToPath(px: number, py: number): number {
  let min = Infinity;
  for (let i = 0; i < PATH_POINTS.length - 1; i++) {
    const [ax, ay] = PATH_POINTS[i]!;
    const [bx, by] = PATH_POINTS[i + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    min = Math.min(min, Math.hypot(px - (ax + dx * t), py - (ay + dy * t)));
  }
  return min;
}

/**
 * Points running parallel to the lane at a given offset, for one side of the road.
 *
 * The heading is averaged over a window rather than taken from the current segment. At a
 * corner the raw heading flips instantly and the offset chain jumps by a road-width, tearing
 * a hole in the border; smoothing makes the chain curve around the corner the same way the
 * road's own round line joins do.
 */
function laneEdge(side: 1 | -1, step: number, offsetAt: (d: number) => number): Pt[] {
  const points: Pt[] = [];
  const total = LANE.length;

  for (let d = 0; d <= total; d += step) {
    let sx = 0;
    let sy = 0;
    for (let k = -4; k <= 4; k++) {
      const sample = LANE.sample(Math.max(0, Math.min(total, d + k * 6)));
      sx += Math.cos(sample.angle);
      sy += Math.sin(sample.angle);
    }
    const angle = Math.atan2(sy, sx);
    const here = LANE.sample(d);
    const offset = offsetAt(d);
    points.push({
      x: here.x - Math.sin(angle) * offset * side,
      y: here.y + Math.cos(angle) * offset * side,
    });
  }
  return points;
}

function tracePolyline(ctx: CanvasRenderingContext2D, points: ReadonlyArray<Pt>): void {
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
}

// ------------------------------------------------------------------ foliage

/**
 * A clump of overlapping canopy discs drawn as one mass: silhouette outline, dark base,
 * then lighter lobes on top. Stacking three tones is what stops a big forest from reading
 * as a flat green blob.
 */
interface Lobe {
  x: number;
  y: number;
  r: number;
  /** Vertical squash. Perfect circles are what make foliage look like soap bubbles. */
  squash: number;
  rot: number;
}

/** An irregular dome of lobes. Count, size and placement all vary per clump. */
function makeLobes(
  rand: () => number,
  cx: number,
  cy: number,
  spread: number,
  baseR: number,
  count: number,
): Lobe[] {
  const lobes: Lobe[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rand() * 0.7;
    const dist = spread * (0.2 + rand() * 0.8);
    lobes.push({
      x: cx + Math.cos(a) * dist,
      y: cy + Math.sin(a) * dist * 0.62,
      r: baseR * (0.68 + rand() * 0.5),
      squash: 0.8 + rand() * 0.32,
      rot: rand() * Math.PI,
    });
  }
  lobes.push({ x: cx, y: cy, r: baseR * 1.05, squash: 0.88, rot: 0 });
  return lobes;
}

/**
 * Outline weight has to scale with the lobe.
 *
 * A flat 5px rim is right for a 30px forest lobe and completely wrong for a 10px roadside
 * bush, where it swallows the fill and the bush renders as a dark green doughnut.
 */
function lobeRim(r: number): number {
  // The floor has to sit below EDGE_OUTLINE. Written as max(2.2, min(EDGE_OUTLINE, ...)) it
  // silently collapsed to a constant the moment the base ink weight dropped under 2.2,
  // ignoring lobe size entirely and re-fattening every bush.
  return Math.max(1.2, Math.min(EDGE_OUTLINE, r * 0.16));
}

function fillLobes(
  ctx: CanvasRenderingContext2D,
  lobes: ReadonlyArray<Lobe>,
  fill: string,
  grown = false,
): void {
  // Same-coloured shapes filled one by one are indistinguishable from filling their union,
  // so there is no need to build a combined path — only the ordering of passes matters.
  ctx.fillStyle = fill;
  for (const l of lobes) {
    const r = grown ? l.r + lobeRim(l.r) : l.r;
    ctx.beginPath();
    ctx.ellipse(l.x, l.y, r, r * l.squash, l.rot, 0, TAU);
    ctx.fill();
  }
}

/**
 * A clump of canopy lobes drawn as one mass.
 *
 * Lobes are painted individually, back to front, each with its own rim — not as concentric
 * rings inside one silhouette. Nesting smaller circles inside a bigger one is exactly what
 * made an earlier pass look like stacked bubbles; letting each lobe overlap and partly hide
 * the one behind it is what gives foliage its clumped, hand-painted read.
 */
function canopyMass(ctx: CanvasRenderingContext2D, lobes: ReadonlyArray<Lobe>): void {
  ctx.save();
  ctx.globalAlpha = 0.18;
  fillLobes(
    ctx,
    lobes.map((l) => ({ ...l, x: l.x + 4, y: l.y + 12 })),
    "#1E3A12",
  );
  ctx.restore();

  // Outline pass for the whole clump before any fill, so interior seams never show.
  fillLobes(ctx, lobes, C.outline, true);
  fillLobes(ctx, lobes, C.leafDeep);

  // Lower lobes are nearer the viewer, so they go last and overlap the rest.
  const ordered = [...lobes].sort((a, b) => a.y - b.y);
  ordered.forEach((l, i) => {
    const lit = i / Math.max(1, ordered.length - 1);
    ctx.beginPath();
    ctx.ellipse(l.x, l.y - 2, l.r * 0.9, l.r * 0.9 * l.squash, l.rot, 0, TAU);
    ctx.fillStyle = lit > 0.55 ? C.leafDark : C.leafMid;
    ctx.fill();
    ctx.lineWidth = Math.max(0.9, Math.min(1.6, l.r * 0.09));
    ctx.strokeStyle = C.leafDeep;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(
      l.x - l.r * 0.24, l.y - l.r * 0.34,
      l.r * 0.4, l.r * 0.4 * l.squash, l.rot, 0, TAU,
    );
    ctx.fillStyle = lit > 0.55 ? C.leafMid : C.leafLight;
    ctx.fill();
  });
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  rand: () => number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.ellipse(3, 6, 22, 8, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.25)";
  ctx.fill();

  outlined(
    ctx,
    () => {
      ctx.moveTo(-6, 8);
      ctx.lineTo(-4, -14);
      ctx.lineTo(4, -14);
      ctx.lineTo(6, 8);
      ctx.closePath();
    },
    C.woodMid,
    4,
  );

  canopyMass(ctx, makeLobes(rand, 0, -30, 17, 15, 5));
  ctx.restore();
}

function drawBush(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  rand: () => number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  canopyMass(ctx, makeLobes(rand, 0, 0, 10, 10, 4));
  ctx.restore();
}

// -------------------------------------------------------------------- props

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.ellipse(2, 4, 18, 6, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.22)";
  ctx.fill();

  outlined(
    ctx,
    () => {
      ctx.moveTo(-16, 4);
      ctx.lineTo(-10, -10);
      ctx.lineTo(2, -14);
      ctx.lineTo(14, -6);
      ctx.lineTo(16, 4);
      ctx.closePath();
    },
    C.stoneMid,
  );
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  ctx.lineTo(2, -14);
  ctx.lineTo(4, -7);
  ctx.lineTo(-8, -4);
  ctx.closePath();
  ctx.fillStyle = C.stoneLight;
  ctx.fill();

  ctx.restore();
}

function drawStump(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  outlined(
    ctx,
    () => {
      ctx.moveTo(-11, 6);
      ctx.lineTo(-10, -6);
      ctx.lineTo(10, -6);
      ctx.lineTo(11, 6);
      ctx.closePath();
    },
    C.woodDark,
  );
  outlined(ctx, () => ctx.ellipse(0, -6, 10, 4.5, 0, 0, TAU), C.wood);
  ctx.beginPath();
  ctx.ellipse(0, -6, 5, 2.2, 0, 0, TAU);
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = INK_FINE * 0.8;
  ctx.stroke();
  ctx.restore();
}

function drawLogs(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  for (const [dx, dy] of [
    [-8, 4],
    [8, 4],
    [0, -6],
  ] as const) {
    outlined(ctx, () => ctx.roundRect(dx - 13, dy - 6, 26, 12, 5), C.wood);
    outlined(ctx, () => ctx.ellipse(dx + 11, dy, 3.5, 5.5, 0, 0, TAU), C.canvasMid, INK_FINE);
  }
  ctx.restore();
}

function drawBarrel(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  outlined(ctx, () => ctx.roundRect(-9, -12, 18, 24, 6), C.wood);
  ctx.beginPath();
  ctx.moveTo(-9, -4);
  ctx.lineTo(9, -4);
  ctx.moveTo(-9, 4);
  ctx.lineTo(9, 4);
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = INK_FINE;
  ctx.stroke();
  outlined(ctx, () => ctx.ellipse(0, -12, 9, 3.5, 0, 0, TAU), C.canvasMid);
  ctx.restore();
}

function drawTent(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.ellipse(2, 22, 30, 8, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.22)";
  ctx.fill();

  // Body: a wide cone with a darker right face.
  outlined(
    ctx,
    () => {
      ctx.moveTo(-28, 20);
      ctx.quadraticCurveTo(0, 26, 28, 20);
      ctx.lineTo(0, -28);
      ctx.closePath();
    },
    C.canvasLight,
  );
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(28, 20);
  ctx.quadraticCurveTo(14, 23, 4, 22);
  ctx.closePath();
  ctx.fillStyle = C.canvasMid;
  ctx.fill();

  // Doorway.
  outlined(
    ctx,
    () => {
      ctx.moveTo(-8, 21);
      ctx.lineTo(0, -8);
      ctx.lineTo(8, 21);
      ctx.closePath();
    },
    C.canvasBlue,
  );

  // Finial and guy rope.
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(0, -38);
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(34, 18);
  ctx.strokeStyle = "rgba(36,28,18,0.5)";
  ctx.lineWidth = INK * 0.6;
  ctx.stroke();

  ctx.restore();
}

function drawHut(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.ellipse(2, 20, 32, 8, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.22)";
  ctx.fill();

  outlined(ctx, () => ctx.rect(-24, -2, 48, 22), C.canvasMid);
  outlined(
    ctx,
    () => {
      ctx.moveTo(-30, -2);
      ctx.quadraticCurveTo(0, -34, 30, -2);
      ctx.closePath();
    },
    C.thatch,
  );
  // Thatch combing.
  ctx.strokeStyle = C.thatchDark;
  ctx.lineWidth = INK_FINE;
  for (const dx of [-18, -6, 6, 18]) {
    ctx.beginPath();
    ctx.moveTo(dx, -3);
    ctx.quadraticCurveTo(dx * 0.6, -18, dx * 0.25, -24);
    ctx.stroke();
  }
  outlined(ctx, () => ctx.roundRect(-7, 4, 14, 16, 2), C.woodDark);

  ctx.restore();
}

function drawHaystack(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.ellipse(2, 12, 20, 6, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.22)";
  ctx.fill();
  outlined(
    ctx,
    () => {
      ctx.moveTo(-18, 11);
      ctx.quadraticCurveTo(-14, -14, 0, -16);
      ctx.quadraticCurveTo(14, -14, 18, 11);
      ctx.closePath();
    },
    C.thatch,
  );
  ctx.strokeStyle = C.thatchDark;
  ctx.lineWidth = INK_FINE;
  for (const dx of [-9, 0, 9]) {
    ctx.beginPath();
    ctx.moveTo(dx, 10);
    ctx.quadraticCurveTo(dx * 0.7, -6, dx * 0.3, -14);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFence(ctx: CanvasRenderingContext2D, x: number, y: number, panels: number): void {
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < panels; i++) {
    const px = i * 30;
    outlined(ctx, () => ctx.roundRect(px - 3, -16, 7, 26, 2), C.wood);
    if (i < panels - 1) {
      outlined(ctx, () => ctx.roundRect(px + 2, -12, 28, 5, 2), C.woodMid, INK_FINE);
      outlined(ctx, () => ctx.roundRect(px + 2, -2, 28, 5, 2), C.woodMid, INK_FINE);
    }
  }
  ctx.restore();
}

function drawSheep(ctx: CanvasRenderingContext2D, x: number, y: number, flip: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);

  ctx.beginPath();
  ctx.ellipse(0, 7, 12, 4, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.22)";
  ctx.fill();

  ctx.strokeStyle = C.outline;
  ctx.lineWidth = INK;
  for (const dx of [-5, 4]) {
    ctx.beginPath();
    ctx.moveTo(dx, 2);
    ctx.lineTo(dx, 7);
    ctx.stroke();
  }
  // Fleece as three lobes so the silhouette stays bumpy at this size.
  unionCircles(ctx, [{ x: -5, y: 0 }, { x: 2, y: -2 }, { x: 7, y: 1 }], 9, C.outline);
  unionCircles(ctx, [{ x: -5, y: 0 }, { x: 2, y: -2 }, { x: 7, y: 1 }], 6.5, C.wool);
  outlined(ctx, () => ctx.ellipse(-11, 1, 4.5, 4, 0, 0, TAU), C.stoneDark, INK_FINE);

  ctx.restore();
}

function drawWell(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.ellipse(2, 16, 22, 7, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.22)";
  ctx.fill();

  outlined(ctx, () => ctx.roundRect(-17, -2, 34, 18, 4), C.stoneMid);
  outlined(ctx, () => ctx.ellipse(0, -2, 17, 7, 0, 0, TAU), C.stoneLight);
  ctx.beginPath();
  ctx.ellipse(0, -2, 11, 4.2, 0, 0, TAU);
  ctx.fillStyle = C.outline;
  ctx.fill();

  // Posts and roof.
  outlined(ctx, () => ctx.roundRect(-15, -30, 4.5, 28, 2), C.woodMid, INK_FINE);
  outlined(ctx, () => ctx.roundRect(10.5, -30, 4.5, 28, 2), C.woodMid, INK_FINE);
  outlined(
    ctx,
    () => {
      ctx.moveTo(-22, -28);
      ctx.lineTo(0, -42);
      ctx.lineTo(22, -28);
      ctx.closePath();
    },
    C.thatch,
  );

  ctx.restore();
}

/** Small colour accents. Grass this flat needs something to break it up. */
function drawFlowers(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
  rand: () => number,
): void {
  const tints = ["#F2E27A", "#F4F0E4", "#E8899A", "#C9A6E0"];
  for (let i = 0; i < count; i++) {
    const fx = x + (rand() - 0.5) * 34;
    const fy = y + (rand() - 0.5) * 20;
    ctx.beginPath();
    ctx.arc(fx, fy, 2.4 + rand() * 1.1, 0, TAU);
    ctx.fillStyle = tints[Math.floor(rand() * tints.length)]!;
    ctx.fill();
    ctx.lineWidth = INK * 0.55;
    ctx.strokeStyle = "rgba(36,28,18,0.45)";
    ctx.stroke();
  }
}

function drawSignpost(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  outlined(ctx, () => ctx.roundRect(-2.5, -12, 5, 18, 2), C.woodMid, INK_FINE);
  outlined(ctx, () => ctx.roundRect(-11, -24, 22, 15, 3), C.canvasLight, INK_FINE);
  // Two ruled lines rather than a glyph: at this size any letterform just reads as a typo.
  ctx.strokeStyle = C.sandDark;
  ctx.lineWidth = INK * 0.7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, -19);
  ctx.lineTo(6, -19);
  ctx.moveTo(-6, -14.5);
  ctx.lineTo(2, -14.5);
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ terrain

/**
 * The lane, drawn as a closed polygon whose two long edges wobble.
 *
 * An earlier version stamped overlapping discs along the edge and punched them back out to
 * carve a scalloped border. It worked, but wherever two discs met, the gap between their
 * bites stayed filled with outline colour, so the border came out as a heavy black chain
 * instead of a thin line following grass tufts.
 *
 * Describing the boundary directly is both simpler and cleaner: offset each edge by a sum of
 * two sine waves and stroke the resulting outline once. One line, one weight, no valleys —
 * and the amplitude and wavelength become honest dials for how ragged the edge looks.
 */
function drawLane(ctx: CanvasRenderingContext2D, rand: () => number): void {
  /**
   * Fine, irregular verge. The dominant feature is ~7px of road — eight times smaller than
   * the sweeping 55px scallops this replaced, which read as a torn paper cutout rather than
   * grass meeting dirt.
   *
   * Three octaves of noise rather than three sines: at this scale a sine is a machined comb.
   * Total swing stays under ~2px, so the boundary is a texture, not a silhouette.
   */
  const edgeNoise = (seed: number) => {
    const fine = makeNoise1D(seed);
    const finer = makeNoise1D(seed + 101);
    const swell = makeNoise1D(seed + 202);
    return (d: number) =>
      ROAD_HALF + fine(d / 7) * 1.1 + finer(d / 3.5) * 0.5 + swell(d / 26) * 1.2;
  };

  // Separate seeds per side so the two edges never mirror each other.
  // Step must stay well under the 7px feature size or the detail aliases into jitter.
  const left = laneEdge(1, 1.5, edgeNoise(7717));
  const right = laneEdge(-1, 1.5, edgeNoise(4231));

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Grass thickness: darken a narrow band hugging each edge. The road is filled straight
  // after and covers the inner half, leaving a thin rim of shadow on the grass side only.
  // Kept narrow — against a now-delicate boundary a wide rim reads as a halo, not thickness.
  ctx.strokeStyle = C.grassDeep;
  ctx.lineWidth = 3;
  for (const edge of [left, right]) {
    ctx.beginPath();
    tracePolyline(ctx, edge);
    ctx.stroke();
  }

  const roadShape = () => {
    ctx.beginPath();
    tracePolyline(ctx, left);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i]!.x, right[i]!.y);
    ctx.closePath();
  };

  roadShape();
  ctx.fillStyle = C.sandDark;
  ctx.fill();
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = EDGE_OUTLINE;
  ctx.stroke();

  // Lighter worn interior, stroked along the centre line so it stays clear of the wobble.
  const inner = (width: number, color: string) => {
    tracePath(ctx);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  inner(ROAD_HALF * 2 - 22, C.sandMid);
  inner(ROAD_HALF * 2 - 34, C.sand);
  inner(ROAD_HALF - 10, C.sandLight);

  // Grit and ruts, clipped to the road so nothing speckles the grass.
  ctx.save();
  roadShape();
  ctx.clip();
  for (let i = 0; i < 1600; i++) {
    const x = rand() * VIEW.width;
    const y = rand() * VIEW.height;
    if (distanceToPath(x, y) > ROAD_HALF) continue;
    ctx.beginPath();
    ctx.ellipse(x, y, 1.2 + rand() * 3.4, 0.9 + rand() * 1.8, rand() * Math.PI, 0, TAU);
    ctx.fillStyle = rand() > 0.5 ? "rgba(154,124,70,0.26)" : "rgba(255,255,255,0.28)";
    ctx.fill();
  }
  ctx.restore();
}

function makeTerrain(): GeneratedTexture {
  const [canvas, ctx] = makeCanvas(VIEW.width, VIEW.height);
  const rand = mulberry32(20260808);

  // Scenery must also keep clear of the depot, which is drawn as a live sprite on top of
  // this texture rather than baked into it.
  const clearOfPads = (x: number, y: number, pad = 72) =>
    BUILD_SLOTS.every(([sx, sy]) => Math.hypot(x - sx, y - sy) > pad) &&
    Math.hypot(x - DEPOT.x, y - DEPOT.y) > pad + 24;

  // --- ground -------------------------------------------------------------
  ctx.fillStyle = C.grassMid;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  // Very low-contrast mottling. Anything stronger and the ellipses stop reading as ground
  // variation and start reading as pale discs lying on the grass.
  for (const [count, alphaLight, alphaDark] of [
    [90, "rgba(143,201,74,0.10)", "rgba(63,114,35,0.09)"],
    [260, "rgba(143,201,74,0.07)", "rgba(63,114,35,0.06)"],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const x = rand() * VIEW.width;
      const y = rand() * VIEW.height;
      const r = 40 + rand() * 110;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.28 + rand() * 0.22), rand() * Math.PI, 0, TAU);
      ctx.fillStyle = rand() > 0.5 ? alphaLight : alphaDark;
      ctx.fill();
    }
  }

  for (let i = 0; i < 1100; i++) {
    const x = rand() * VIEW.width;
    const y = rand() * VIEW.height;
    if (distanceToPath(x, y) < ROAD_HALF + 22) continue;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 1.5, y - 6, x + 4, y - 9);
    ctx.strokeStyle = rand() > 0.5 ? "rgba(63,114,35,0.5)" : "rgba(160,210,100,0.4)";
    ctx.lineWidth = 1.7;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  drawLane(ctx, rand);

  // --- forest framing -----------------------------------------------------
  // Dense canopy around the rim pulls the eye inward and hides the map's hard edges.
  const forestBands: Array<[number, number, number, number, number]> = [
    // x0, y0, x1, y1, count
    [-40, -40, 320, 70, 26],
    [320, -40, 1030, 78, 34],
    [-40, 250, 95, 760, 26],
    [-40, 640, 1280, 770, 46],
    [1195, 270, 1320, 760, 22],
  ];

  const blobs: Array<Pt & { r: number }> = [];
  for (const [x0, y0, x1, y1, count] of forestBands) {
    for (let i = 0; i < count; i++) {
      const x = x0 + rand() * (x1 - x0);
      const y = y0 + rand() * (y1 - y0);
      if (distanceToPath(x, y) < ROAD_HALF + 62) continue;
      if (!clearOfPads(x, y, 96)) continue;
      blobs.push({ x, y, r: 22 + rand() * 16 });
    }
  }
  // Painter's order: far masses first so nearer canopies overlap them correctly.
  blobs.sort((a, b) => a.y - b.y);
  for (const b of blobs) {
    canopyMass(ctx, makeLobes(rand, b.x, b.y, b.r * 0.9, b.r * 0.72, 4 + Math.floor(rand() * 3)));
  }

  // --- props --------------------------------------------------------------
  type Prop = [number, number, number, string];
  const props: Prop[] = [
    // Camp, tucked into the upper-left clearing.
    [356, 226, 1.5, "tent"],
    [452, 262, 1.15, "tent"],
    [286, 282, 1.3, "logs"],
    [408, 312, 1.2, "barrel"],
    [246, 216, 1.3, "stump"],

    // Smallholding inside the bend.
    [744, 296, 1.55, "hut"],
    [858, 330, 1.3, "haystack"],
    [928, 298, 1.1, "haystack"],
    [636, 262, 1.2, "stump"],
    [592, 352, 1.2, "well"],
    [548, 274, 1.15, "bush"],
    [890, 470, 1.1, "bush"],
    [930, 400, 1.15, "stump"],

    // Scattered field dressing.
    [148, 456, 1.2, "rock"],
    [236, 598, 1.2, "bush"],
    [566, 186, 1.15, "bush"],
    [986, 210, 1.2, "rock"],
    [1136, 468, 1.15, "bush"],
    [516, 648, 1.15, "rock"],
    [884, 602, 1.2, "bush"],
    [92, 212, 1.1, "bush"],
    [1154, 604, 1.1, "stump"],
    [432, 92, 1.05, "tree"],
    [1064, 126, 1.1, "tree"],
  ];

  for (const [x, y, scale, kind] of props) {
    if (distanceToPath(x, y) < ROAD_HALF + 40) continue;
    if (!clearOfPads(x, y)) continue;
    switch (kind) {
      case "tent": drawTent(ctx, x, y, scale); break;
      case "hut": drawHut(ctx, x, y, scale); break;
      case "haystack": drawHaystack(ctx, x, y, scale); break;
      case "logs": drawLogs(ctx, x, y, scale); break;
      case "barrel": drawBarrel(ctx, x, y, scale); break;
      case "stump": drawStump(ctx, x, y, scale); break;
      case "rock": drawRock(ctx, x, y, scale); break;
      case "bush": drawBush(ctx, x, y, scale, rand); break;
      case "tree": drawTree(ctx, x, y, scale, rand); break;
      case "well": drawWell(ctx, x, y, scale); break;
      default: break;
    }
  }

  drawFence(ctx, 812, 392, 4);
  drawSheep(ctx, 800, 424, false);
  drawSheep(ctx, 856, 434, true);
  drawSheep(ctx, 892, 410, false);
  drawSheep(ctx, 706, 436, false);
  drawSheep(ctx, 752, 452, true);

  // Flower clusters, kept off the road and away from the pads.
  for (let i = 0; i < 26; i++) {
    const x = 40 + rand() * (VIEW.width - 80);
    const y = 40 + rand() * (VIEW.height - 80);
    if (distanceToPath(x, y) < ROAD_HALF + 34) continue;
    if (!clearOfPads(x, y, 60)) continue;
    drawFlowers(ctx, x, y, 3 + Math.floor(rand() * 4), rand);
  }

  // --- vignette -----------------------------------------------------------
  const vignette = ctx.createRadialGradient(
    VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.42,
    VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.92,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(20,40,10,0.30)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  return { key: "terrain", canvas };
}

// -------------------------------------------------------------------- pieces

/**
 * A patch of bare earth worn into the grass.
 *
 * Deliberately flat. An earlier version ringed it with grass discs and an offset shadow,
 * which turned the pad into a raised stone dais — towers looked like they were standing on
 * plinths. The reference has nothing of the sort: just a scuffed clearing on the ground.
 * There is no dark outline either; a black rim on flat ground reads as a lip, so the edge is
 * carried entirely by a darker *dirt* tone.
 */
function makePad(withPost: boolean): GeneratedTexture {
  const size = 104;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;
  const rand = mulberry32(withPost ? 5150 : 5151);

  // An outline wobbled by noise, so the clearing looks scuffed rather than stamped out with
  // a cookie cutter. Reuses the same trick as the roadside verge.
  const wobble = makeNoise1D(918);
  const blob = (rx: number, ry: number, cy: number, amount: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU;
      const k = 1 + wobble((a / TAU) * 12) * amount;
      const x = c + Math.cos(a) * rx * k;
      const y = cy + Math.sin(a) * ry * k;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  // Damp ring of darker soil, then the dry middle.
  blob(31, 16, c + 8, 0.1);
  ctx.fillStyle = C.sandDark;
  ctx.fill();

  blob(27, 13.5, c + 7, 0.09);
  ctx.fillStyle = C.sandMid;
  ctx.fill();

  blob(19, 9, c + 6, 0.12);
  ctx.fillStyle = C.sand;
  ctx.fill();

  // Grit, so the middle is not a flat wash.
  for (let i = 0; i < 26; i++) {
    const a = rand() * TAU;
    const d = Math.sqrt(rand());
    ctx.beginPath();
    ctx.ellipse(
      c + Math.cos(a) * 26 * d,
      c + 8 + Math.sin(a) * 13 * d,
      0.9 + rand() * 1.7,
      0.7 + rand() * 1.1,
      rand() * Math.PI,
      0,
      TAU,
    );
    ctx.fillStyle = rand() > 0.5 ? "rgba(154,124,70,0.34)" : "rgba(255,255,255,0.26)";
    ctx.fill();
  }

  if (withPost) drawSignpost(ctx, c, c + 4);

  return { key: withPost ? "pad" : "padBase", canvas };
}

function makeTowerBase(): GeneratedTexture {
  const size = 80;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  ctx.beginPath();
  ctx.ellipse(c + 1, c + 22, 30, 11, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.32)";
  ctx.fill();

  outlined(
    ctx,
    () => {
      ctx.moveTo(c - 22, c + 24);
      ctx.lineTo(c - 17, c - 8);
      ctx.lineTo(c + 17, c - 8);
      ctx.lineTo(c + 22, c + 24);
      ctx.closePath();
    },
    C.stoneMid,
    3,
  );

  ctx.beginPath();
  ctx.moveTo(c - 22, c + 24);
  ctx.lineTo(c - 17, c - 8);
  ctx.lineTo(c - 5, c - 8);
  ctx.lineTo(c - 8, c + 24);
  ctx.closePath();
  ctx.fillStyle = "rgba(207,201,188,0.55)";
  ctx.fill();

  ctx.strokeStyle = "rgba(117,110,96,0.7)";
  ctx.lineWidth = 2;
  for (const y of [c + 2, c + 12]) {
    ctx.beginPath();
    ctx.moveTo(c - 20, y);
    ctx.lineTo(c + 20, y);
    ctx.stroke();
  }

  outlined(ctx, () => ctx.rect(c - 26, c - 18, 52, 12), C.stoneLight, 3);
  for (const x of [-24, -8, 8]) {
    outlined(ctx, () => ctx.rect(c + x, c - 26, 12, 10), C.stoneLight, 2.5);
  }

  return { key: "towerBase", canvas };
}

/** Turret drawn facing right (angle 0) so the sprite can simply be rotated. */
function makeTurret(): GeneratedTexture {
  const size = 56;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  outlined(ctx, () => ctx.arc(c, c, 13, 0, TAU), C.wood, 3);
  ctx.beginPath();
  ctx.arc(c - 3, c - 3, 7, 0, TAU);
  ctx.fillStyle = "rgba(235,217,174,0.35)";
  ctx.fill();

  outlined(
    ctx,
    () => {
      ctx.moveTo(c + 6, c - 13);
      ctx.quadraticCurveTo(c + 20, c, c + 6, c + 13);
      ctx.quadraticCurveTo(c + 13, c, c + 6, c - 13);
      ctx.closePath();
    },
    C.woodDark,
    2.5,
  );

  ctx.beginPath();
  ctx.moveTo(c + 7, c - 12);
  ctx.lineTo(c + 7, c + 12);
  ctx.strokeStyle = C.parchment;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  return { key: "turret", canvas };
}

function makeGrunt(): GeneratedTexture {
  const size = 40;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  ctx.beginPath();
  ctx.ellipse(c, c + 14, 12, 4.5, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.32)";
  ctx.fill();

  outlined(ctx, () => ctx.roundRect(c - 7, c + 2, 5, 11, 2), C.gruntDark, INK_UNIT * 0.8);
  outlined(ctx, () => ctx.roundRect(c + 2, c + 2, 5, 11, 2), C.gruntDark, INK_UNIT * 0.8);
  outlined(ctx, () => ctx.ellipse(c, c + 1, 11, 10, 0, 0, TAU), C.gruntMid, INK_UNIT);
  outlined(ctx, () => ctx.ellipse(c, c - 8, 12, 10, 0, 0, TAU), C.gruntLight, INK_UNIT);

  outlined(
    ctx,
    () => {
      ctx.moveTo(c - 11, c - 11);
      ctx.lineTo(c - 18, c - 17);
      ctx.lineTo(c - 9, c - 5);
      ctx.closePath();
    },
    C.gruntMid,
    INK_UNIT * 0.8,
  );
  outlined(
    ctx,
    () => {
      ctx.moveTo(c + 11, c - 11);
      ctx.lineTo(c + 18, c - 17);
      ctx.lineTo(c + 9, c - 5);
      ctx.closePath();
    },
    C.gruntMid,
    INK_UNIT * 0.8,
  );

  for (const dx of [-4.5, 4.5]) {
    ctx.beginPath();
    ctx.ellipse(c + dx, c - 9, 3.2, 3.6, 0, 0, TAU);
    ctx.fillStyle = "#F7F2E2";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c + dx + 0.8, c - 9, 1.7, 0, TAU);
    ctx.fillStyle = C.outline;
    ctx.fill();
  }

  ctx.fillStyle = "#F7F2E2";
  for (const dx of [-3.5, 3.5]) {
    ctx.beginPath();
    ctx.moveTo(c + dx - 1.6, c - 2);
    ctx.lineTo(c + dx + 1.6, c - 2);
    ctx.lineTo(c + dx, c - 5.5);
    ctx.closePath();
    ctx.fill();
  }

  return { key: "grunt", canvas };
}

function makeBrute(): GeneratedTexture {
  const size = 56;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  ctx.beginPath();
  ctx.ellipse(c, c + 20, 18, 6, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.35)";
  ctx.fill();

  outlined(ctx, () => ctx.roundRect(c - 10, c + 6, 7, 14, 3), C.bruteDark, INK_UNIT * 0.8);
  outlined(ctx, () => ctx.roundRect(c + 3, c + 6, 7, 14, 3), C.bruteDark, INK_UNIT * 0.8);
  outlined(ctx, () => ctx.ellipse(c, c + 3, 17, 14, 0, 0, TAU), C.bruteMid, INK_UNIT);

  outlined(ctx, () => ctx.ellipse(c - 15, c - 2, 7, 8, -0.3, 0, TAU), C.stoneMid, INK_UNIT * 0.8);
  outlined(ctx, () => ctx.ellipse(c + 15, c - 2, 7, 8, 0.3, 0, TAU), C.stoneMid, INK_UNIT * 0.8);

  outlined(ctx, () => ctx.ellipse(c, c - 11, 13, 11, 0, 0, TAU), C.bruteLight, INK_UNIT);

  outlined(
    ctx,
    () => {
      ctx.moveTo(c - 12, c - 16);
      ctx.quadraticCurveTo(c - 20, c - 24, c - 13, c - 26);
      ctx.quadraticCurveTo(c - 12, c - 20, c - 8, c - 17);
      ctx.closePath();
    },
    "#EBE3D2",
    INK_UNIT * 0.8,
  );
  outlined(
    ctx,
    () => {
      ctx.moveTo(c + 12, c - 16);
      ctx.quadraticCurveTo(c + 20, c - 24, c + 13, c - 26);
      ctx.quadraticCurveTo(c + 12, c - 20, c + 8, c - 17);
      ctx.closePath();
    },
    "#EBE3D2",
    INK_UNIT * 0.8,
  );

  for (const dx of [-5, 5]) {
    ctx.beginPath();
    ctx.ellipse(c + dx, c - 12, 3.4, 3.8, 0, 0, TAU);
    ctx.fillStyle = "#FFE9B0";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c + dx, c - 12, 1.7, 0, TAU);
    ctx.fillStyle = C.outline;
    ctx.fill();
  }

  return { key: "brute", canvas };
}

function makeArrow(): GeneratedTexture {
  const [canvas, ctx] = makeCanvas(28, 12);
  const cy = 6;

  ctx.beginPath();
  ctx.moveTo(3, cy);
  ctx.lineTo(19, cy);
  ctx.strokeStyle = C.wood;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.stroke();

  outlined(
    ctx,
    () => {
      ctx.moveTo(26, cy);
      ctx.lineTo(17, cy - 5);
      ctx.lineTo(19, cy);
      ctx.lineTo(17, cy + 5);
      ctx.closePath();
    },
    C.stoneLight,
    1.5,
  );

  ctx.beginPath();
  ctx.moveTo(2, cy - 4);
  ctx.lineTo(7, cy);
  ctx.lineTo(2, cy + 4);
  ctx.closePath();
  ctx.fillStyle = C.parchment;
  ctx.fill();

  return { key: "arrow", canvas };
}

function makeSpark(): GeneratedTexture {
  const size = 24;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const r = i % 2 === 0 ? 11 : 4.5;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#FFF0C2";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(c, c, 4, 0, TAU);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();

  return { key: "spark", canvas };
}

function makePuff(): GeneratedTexture {
  const size = 40;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  for (const [dx, dy, r] of [
    [-8, 2, 9],
    [8, 3, 8],
    [0, -6, 10],
    [-4, 8, 7],
  ] as const) {
    ctx.beginPath();
    ctx.arc(c + dx, c + dy, r, 0, TAU);
    ctx.fillStyle = "rgba(235,217,174,0.85)";
    ctx.fill();
  }

  return { key: "puff", canvas };
}

function makeKeep(): GeneratedTexture {
  const size = 150;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  ctx.beginPath();
  ctx.ellipse(c, c + 52, 56, 16, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.32)";
  ctx.fill();

  outlined(ctx, () => ctx.rect(c - 46, c - 6, 92, 60), C.stoneMid, 3.5);
  ctx.beginPath();
  ctx.rect(c - 46, c - 6, 26, 60);
  ctx.fillStyle = "rgba(207,201,188,0.45)";
  ctx.fill();

  outlined(
    ctx,
    () => {
      ctx.moveTo(c - 15, c + 54);
      ctx.lineTo(c - 15, c + 16);
      ctx.quadraticCurveTo(c, c - 2, c + 15, c + 16);
      ctx.lineTo(c + 15, c + 54);
      ctx.closePath();
    },
    C.woodDark,
    3,
  );
  ctx.strokeStyle = "rgba(154,106,65,0.9)";
  ctx.lineWidth = 2;
  for (const y of [c + 22, c + 34, c + 46]) {
    ctx.beginPath();
    ctx.moveTo(c - 14, y);
    ctx.lineTo(c + 14, y);
    ctx.stroke();
  }

  for (const dx of [-46, 46]) {
    outlined(ctx, () => ctx.rect(c + dx - 16, c - 26, 32, 80), C.stoneLight, 3.5);
    outlined(
      ctx,
      () => {
        ctx.moveTo(c + dx - 20, c - 26);
        ctx.lineTo(c + dx, c - 54);
        ctx.lineTo(c + dx + 20, c - 26);
        ctx.closePath();
      },
      C.danger,
      3,
    );
  }

  for (const dx of [-30, -10, 10, 30]) {
    outlined(ctx, () => ctx.rect(c + dx - 7, c - 18, 14, 12), C.stoneLight, 2.5);
  }

  return { key: "keep", canvas };
}

/**
 * A flat tower silhouette for the build button. The in-world turret sprite reads as an
 * ambiguous dark crescent at icon size, so the menu gets a purpose-drawn glyph instead.
 */
function makeTowerIcon(): GeneratedTexture {
  const size = 44;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  outlined(
    ctx,
    () => {
      ctx.moveTo(c - 11, c + 16);
      ctx.lineTo(c - 8, c - 4);
      ctx.lineTo(c + 8, c - 4);
      ctx.lineTo(c + 11, c + 16);
      ctx.closePath();
    },
    C.stoneMid,
    3,
  );

  outlined(ctx, () => ctx.rect(c - 13, c - 10, 26, 7), C.stoneLight, 3);
  for (const dx of [-12, -3, 6]) {
    outlined(ctx, () => ctx.rect(c + dx, c - 17, 6, 8), C.stoneLight, 2.5);
  }

  ctx.beginPath();
  ctx.rect(c - 2, c + 2, 4, 8);
  ctx.fillStyle = C.outline;
  ctx.fill();

  return { key: "towerIcon", canvas };
}

function makeCrate(): GeneratedTexture {
  const size = 24;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  outlined(ctx, () => ctx.roundRect(c - 9, c - 8, 18, 16, 3), C.wood, 3);
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(c - 9, c - 2.5);
  ctx.lineTo(c + 9, c - 2.5);
  ctx.moveTo(c - 9, c + 3);
  ctx.lineTo(c + 9, c + 3);
  ctx.stroke();

  return { key: "crate", canvas };
}

/** Where crates come from: a shed with a stack of them outside. */
function makeDepot(): GeneratedTexture {
  const size = 128;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  ctx.beginPath();
  ctx.ellipse(c, c + 34, 46, 12, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.30)";
  ctx.fill();

  outlined(ctx, () => ctx.rect(c - 34, c - 10, 68, 44), C.canvasMid, 4);
  ctx.beginPath();
  ctx.rect(c - 34, c - 10, 20, 44);
  ctx.fillStyle = "rgba(242,234,214,0.5)";
  ctx.fill();

  // Roof, overhanging on both sides.
  outlined(
    ctx,
    () => {
      ctx.moveTo(c - 44, c - 8);
      ctx.lineTo(c, c - 40);
      ctx.lineTo(c + 44, c - 8);
      ctx.closePath();
    },
    C.thatch,
    4,
  );
  ctx.strokeStyle = C.thatchDark;
  ctx.lineWidth = 2.2;
  for (const dx of [-24, -10, 6, 20]) {
    ctx.beginPath();
    ctx.moveTo(c + dx, c - 9);
    ctx.quadraticCurveTo(c + dx * 0.6, c - 22, c + dx * 0.25, c - 32);
    ctx.stroke();
  }

  // Open doorway so it reads as a store, not a house.
  outlined(ctx, () => ctx.rect(c - 12, c + 6, 24, 28), C.woodDark, 3.5);

  // Crates stacked against the wall.
  const crate = (x: number, y: number, s: number) => {
    outlined(ctx, () => ctx.roundRect(x - 9 * s, y - 8 * s, 18 * s, 16 * s, 3), C.wood, 3);
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 9 * s, y);
    ctx.lineTo(x + 9 * s, y);
    ctx.stroke();
  };
  crate(c + 26, c + 26, 1);
  crate(c + 42, c + 28, 0.9);
  crate(c + 30, c + 10, 0.85);
  crate(c - 34, c + 28, 0.95);

  return { key: "depot", canvas };
}

/** Porter, drawn facing right so the sprite can be flipped by travel direction. */
function makePorter(): GeneratedTexture {
  const size = 36;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  ctx.beginPath();
  ctx.ellipse(c, c + 13, 10, 4, 0, 0, TAU);
  ctx.fillStyle = "rgba(30,58,18,0.30)";
  ctx.fill();

  outlined(ctx, () => ctx.roundRect(c - 6, c + 2, 4.5, 10, 2), C.woodDark, INK_UNIT * 0.8);
  outlined(ctx, () => ctx.roundRect(c + 1.5, c + 2, 4.5, 10, 2), C.woodDark, INK_UNIT * 0.8);
  // Tunic in a cool blue: on a warm map the porters need to pop out from the enemies.
  outlined(ctx, () => ctx.ellipse(c, c + 1, 8.5, 8, 0, 0, TAU), C.canvasBlue, INK_UNIT);
  outlined(ctx, () => ctx.ellipse(c, c - 8, 7, 6.5, 0, 0, TAU), "#E8C49A", INK_UNIT);

  for (const dx of [-2.4, 2.4]) {
    ctx.beginPath();
    ctx.arc(c + dx, c - 8.5, 1.5, 0, TAU);
    ctx.fillStyle = C.outline;
    ctx.fill();
  }

  return { key: "porter", canvas };
}

/** Coin with an arrow curving out of it: the dismantle-for-gold button. */
function makeSellIcon(): GeneratedTexture {
  const size = 44;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  outlined(ctx, () => ctx.arc(c - 3, c + 2, 13, 0, TAU), C.goldDark, INK);
  ctx.beginPath();
  ctx.arc(c - 4, c + 1, 8, 0, TAU);
  ctx.fillStyle = C.gold;
  ctx.fill();

  // Arrow leaving the coin, up and to the right.
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = INK * 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(c + 4, c - 4);
  ctx.quadraticCurveTo(c + 14, c - 10, c + 15, c - 16);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c + 15, c - 18);
  ctx.lineTo(c + 10, c - 12);
  ctx.lineTo(c + 19, c - 12);
  ctx.closePath();
  ctx.fillStyle = C.outline;
  ctx.fill();

  return { key: "sellIcon", canvas };
}

/** A soft radial disc, tinted at runtime for range circles and pad highlights. */
function makeGlow(): GeneratedTexture {
  const size = 128;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, "rgba(255,255,255,0.55)");
  gradient.addColorStop(0.6, "rgba(255,255,255,0.22)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return { key: "glow", canvas };
}

/**
 * @param includeTerrain draw the procedural map. False once a painted map is loaded, since
 *   generating a 1280x720 canvas of grass, forest and props takes real time at boot and the
 *   result is thrown away.
 */
export function generateAllTextures(includeTerrain: boolean): GeneratedTexture[] {
  return [
    ...(includeTerrain ? [makeTerrain()] : []),
    makePad(true),
    makePad(false),
    makeTowerBase(),
    makeTurret(),
    makeGrunt(),
    makeBrute(),
    makeArrow(),
    makeSpark(),
    makePuff(),
    makeKeep(),
    makeTowerIcon(),
    makeSellIcon(),
    makeCrate(),
    makeDepot(),
    makePorter(),
    makeGlow(),
  ];
}
