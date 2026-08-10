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
/** Units carry a little more ink than scenery, so they hold up over busy ground. */
const INK_UNIT = INK * 1.25;

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

/**
 * Tower silhouette for the build button.
 *
 * Purpose-drawn rather than a shrunk-down frame of the real tower: at icon size the painted
 * sprite is a brown smudge, while a flat crenellated shape still reads as "tower".
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
  );

  outlined(ctx, () => ctx.rect(c - 13, c - 10, 26, 7), C.stoneLight);
  for (const dx of [-12, -3, 6]) {
    outlined(ctx, () => ctx.rect(c + dx, c - 17, 6, 8), C.stoneLight, INK * 0.75);
  }

  ctx.beginPath();
  ctx.rect(c - 2, c + 2, 4, 8);
  ctx.fillStyle = C.outline;
  ctx.fill();

  return { key: "towerIcon", canvas };
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

/** Porter figure for the hire button. Drawn small on purpose, like the tower icon. */
function makePorterIcon(): GeneratedTexture {
  const size = 36;
  const [canvas, ctx] = makeCanvas(size, size);
  const c = size / 2;

  outlined(ctx, () => ctx.roundRect(c - 6, c + 2, 4.5, 10, 2), C.woodDark, INK_UNIT * 0.8);
  outlined(ctx, () => ctx.roundRect(c + 1.5, c + 2, 4.5, 10, 2), C.woodDark, INK_UNIT * 0.8);
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

export function generateAllTextures(): GeneratedTexture[] {
  return [
    makeArrow(),
    makeSpark(),
    makePuff(),
    makeTowerIcon(),
    makeSellIcon(),
    makePorterIcon(),
  ];
}
