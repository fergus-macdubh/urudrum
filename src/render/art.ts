import { C } from "./palette";

/**
 * The handful of sprites still drawn in code.
 *
 * This file used to generate the entire board — grass, a scalloped lane, forests, huts,
 * sheep, the keep, every unit. All of that is now hand-painted art loaded from
 * `public/sprites/`, so only small UI-ish pieces remain: things that are cheaper to draw than
 * to commission, and that need to match the palette exactly.
 *
 * The deleted procedural map generator is kept at `tools/art.procedural-backup.ts` — the
 * project has no version control, and it was around 700 lines of working code.
 *
 * Real art overrides any of these by texture key; see `REAL_ART` in `GameScene.ts`.
 */

export interface GeneratedTexture {
  key: string;
  canvas: HTMLCanvasElement;
}

const TAU = Math.PI * 2;

/**
 * Base outline weight — the single dial for how heavily inked these sprites are.
 *
 * The painted art sits around 2px of outline at this scale. Everything here used to be
 * hard-coded at 3-5px, about three times too fat, and heavy ink swallowed the small detail.
 */
const INK = 2;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return [canvas, ctx];
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

/** Arrow in flight, drawn pointing right so it can be rotated to its heading. */
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

/** Muzzle flash and hit spark. */
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

/** Dust puff for deaths, deliveries and construction. */
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

export function generateAllTextures(): GeneratedTexture[] {
  return [makeArrow(), makeSpark(), makePuff()];
}
