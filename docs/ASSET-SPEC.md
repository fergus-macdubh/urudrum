# Asset spec — generating art with a public AI

Most of the game is still drawn procedurally in `src/render/art.ts`. The two enemy sprites —
`grunt` and `brute` — are real art and have already been swapped in. This document is the
contract for doing the rest: what to generate, in what format, and how it gets wired up.

## What to generate — and what not to

**Do not generate the map.** The lane is derived from `PATH_POINTS` in `src/sim/config.ts` and
the simulation walks that exact polyline. A painted map would not line up, and enemies would
be walking an invisible road. Terrain stays procedural.

Generate: **props, unit sprites, buildings, UI frames, and tileable ground textures.**

## Which tool

**Recraft V3** (recraft.ai) is the recommendation. It is the only mainstream service with all
three things this job needs at once:

- genuine transparent PNG output
- illustration styles that match a flat, outlined look
- **custom styles** trained from 10–20 reference images — which is what actually solves
  consistency across a whole set, the hard part of this job

It also exports SVG, so props stay resolution-independent and can be recoloured to our palette.

**Staying inside ChatGPT** works, with two workarounds. Alpha is unreliable in the chat UI, so
ask for a solid **magenta `#FF00FF`** background and key it out. Style drifts between separate
generations, so ask for **one asset sheet** — "nine props in a 3×3 grid, identical style" —
rather than nine separate images. Forcing them into a single picture is what makes them match.

**Skip Midjourney here.** Best raw painterly quality, but no dependable alpha and poor
set-to-set consistency.

**Ground textures: do not use AI.** Seamless tiling is exactly what image models are worst at.
**ambientCG** and **Poly Haven** have free CC0 grass and dirt textures that already tile.

## You cannot ask ChatGPT for a pixel size

Worth being blunt about, because it is the first thing everyone tries. The image model
renders at its own fixed set of sizes — roughly **1024×1024** (square), **1024×1536**
(portrait) and **1536×1024** (landscape). Asking for "107×140" does nothing: it renders a
full-size image anyway and you have thrown the request away.

So do not fight it. Two things actually help:

1. **Pick the aspect ratio that wastes least.** Portrait for characters and towers, square for
   props, landscape for banners and UI. A tall knight asked for as a square wastes about half
   the frame on empty air.
2. **Ask for the subject to fill the frame** — "fills the frame, minimal empty margin". More
   of the rendered pixels end up being the thing you wanted.

Then let the import script handle the rest. **Never hand-resize.**

```bash
powershell -ExecutionPolicy Bypass -File .\tools\import-sprite.ps1 -Source "$env:USERPROFILE\Downloads\whatever.png" -Key brute -Height 140
```

It finds the drawing inside the frame by scanning the alpha channel, crops to it, scales to
the height you asked for, and writes `public/sprites/<Key>.png`. The brute went 1024×1536 →
cropped 875×1144 → **107×140, 27 KB**. Then add one line to `REAL_ART` in
`src/render/GameScene.ts` and it is in the game.

`-Height` is the *texture* height; use twice the intended on-screen height. Current on-screen
heights live in `ENEMY_DISPLAY_HEIGHT` in `GameScene.ts`, so `-Height 140` for a unit shown at
70px.

## Format

- **PNG, RGBA, real alpha.** No baked background, no checkerboard. If the model insists on a
  background, ask for solid magenta `#FF00FF` and key it out — the import script will refuse
  an image whose pixels are all opaque and tell you so.
- Aspect ratio chosen per the section above; **the import script sets the final size**, so do
  not worry about pixel dimensions when prompting.
- Trimming and padding are handled by the script (`-Pad`, default 6px).
- **Light from the top-left** on every asset, no exceptions — it is the single most obvious
  giveaway when one sprite was generated in a different session.
- Consistent slightly-from-above 3/4 camera.
- Outline ~4px at 2×, matching `INK = 2` in `art.ts`.
- Palette follows `src/render/palette.ts`.
- A soft contact shadow may be baked in; a hard drop shadow may not.

## Sizes

These are the `-Height` values to pass the import script, not anything to put in a prompt.

| asset | ask for | `-Height` | | asset | ask for | `-Height` |
|---|---|---|---|---|---|---|
| grunt | portrait | 92 | | keep / castle | square | 300 |
| brute | portrait | 140 | | depot | square | 256 |
| porter | portrait | 72 | | tower base | portrait | 200 |
| tree | portrait | 220 | | turret | square | 112 |
| bush | square | 70 | | crate | square | 48 |
| rock | landscape | 50 | | signpost | portrait | 90 |
| tent | square | 150 | | hut | square | 130 |
| haystack | square | 80 | | barrel | portrait | 70 |
| well | portrait | 130 | | grass / dirt tile | square | 512 **seamless** |

## Prompt skeleton

> A single [thing] for a 2D fantasy tower-defence game, seen from slightly above at a
> three-quarter angle. Flat cartoon style, thick dark warm-brown outline (not black), light
> from the top-left, saturated storybook palette, no gradients, no photorealism, no text,
> no ground shadow. **Transparent background. The subject fills the frame with minimal empty
> margin. Portrait orientation.**

For a set of props at once, ask for a 3×3 grid in one image — forcing them into a single
picture is what keeps the style consistent between them — then cut the grid apart and run each
piece through the import script.

## Walk cycles

Ask for **every frame in one picture**. Drawing them together is the only reason the figures
stay on-model — four separate generations of "the same knight, other leg forward" drift in
armour, proportion and colour, and at speed that reads as flickering rather than walking.

Best of all is a **grid: one row per view, four frames across**. That gets all twelve frames
from a single render and keeps the three views identical to each other:

> A 3x4 sprite sheet of the same [character] for a 2D fantasy tower-defence game. Row 1 seen
> from the front, row 2 from the side, row 3 from behind. Each row is a four-frame walk cycle:
> left leg forward, legs together, right leg forward, legs together. Identical character,
> identical size in every frame. Flat cartoon style, thick dark warm-brown outline, light from
> the top-left, transparent background, no ground shadow, no text.

Three views is not a luxury here: the lane has long vertical stretches, and a side view alone
spends a third of the map walking sideways down the road.

Slice it with `import-strip.ps1`, which finds each frame, trims it, scales everything by one
shared factor and bottom-aligns the feet:

```bash
powershell -ExecutionPolicy Bypass -File .\tools\import-strip.ps1 -Source "$env:USERPROFILE\Downloads\peasant.png" -Key peasant -Height 92 -Frames 4 -RowNames "face,side,back"
```

It writes `peasant-face/-side/-back` as PNG + atlas JSON. Then add the prefix to
`WALK_ATLASES` in `GameScene.ts` and the unit animates.

**Always pass `-Frames`.** Frame detection looks for columns of empty pixels, and a shield or
a pitchfork poking into the neighbour's columns leaves no gap to find — two frames then get
read as one, silently.

Rows and frame counts are free to differ per sheet: the peasant came as 3×4, the goblin porter
as 3×3, and the game reads the frame count out of each atlas rather than assuming one.

**Watch what gets drawn onto the character.** The goblin carries his crate as part of the
sprite, so the separate crate the game used to pin above a loaded porter had to go — it would
have been a second crate. The cost is that he now looks loaded on the walk back to the depot
too. An empty-handed row would fix it.

Playback is driven by distance travelled, not a timer, so step rate follows a unit's speed
with no per-enemy tuning and two units never march in lockstep.

## Where the feet go

The import script crops every sprite tight, with **no transparent margin**. That is a
requirement, not a detail: the game assumes a unit's feet are the bottom row of its texture,
and places them `FOOT_BELOW_CENTRE` pixels below its position on the lane — one constant for
every unit at any size. Leave padding on one sprite and it stands at a different height on the
road than the rest.

This is also why `-Pad` defaults to `0` and should stay there. Padding does not survive
scaling consistently anyway: 6px on a 1536px source shrinks to half a pixel, while 6px on an
80px source stays 6px.

## Swapping it in

Real art overrides the drawn version **by texture key**. Add one line to `REAL_ART` in
`src/render/GameScene.ts`:

```ts
const REAL_ART: Record<string, string> = {
  grunt: "sprites/grunt.png",
  brute: "sprites/brute.png",
};
```

`preload()` loads those; `create()` then generates the procedural textures and skips any key
that already exists. So art can arrive one sprite at a time, and `art.ts` never needs editing
— the drawing for that key simply stops being used.

Keys currently available to override: `pad`, `padBase`, `towerBase`, `turret`, `grunt`,
`brute`, `arrow`, `spark`, `puff`, `keep`, `towerIcon`, `crate`, `depot`, `porter`, `glow`.
`terrain` stays procedural — see the top of this document.

On-screen size is separate from texture size. For units it lives in `ENEMY_DISPLAY_HEIGHT`;
the sprite is scaled to that height whatever resolution it arrived at.
