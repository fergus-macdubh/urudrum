# Urudrum: The Orcish Stronghold

A tower-defense prototype for phones, in the spirit of Kingdom Rush. Android first via
Capacitor, with iOS reachable from the same codebase.

One map, one tower type, two enemy types, five waves, **~60–68 seconds** a run.

Nothing proprietary is used. Mechanics aren't protectable, so lanes, build pads and wave
timers are fair game; the art is drawn from scratch in a similar visual register.

## Running it

```bash
npm install && npm run dev
```

Then open http://localhost:5173. `npm run build` produces `dist/`; `npm run typecheck` runs
`tsc --noEmit`.

## How to play

You have 110 gold and 10 lives. Tap a stone pad to open the build menu, tap the tower to buy
it (60 gold). Towers shoot whichever enemy in range is furthest along the road. Anything that
reaches the keep costs you lives. Survive five waves to win.

**Towers need ammunition.** Every shot burns a round, and an empty tower tracks targets but
cannot fire — it fades out and flags a red crate. Porters continuously haul crates from the
depot in the middle of the map to whichever tower is emptiest, so a pad far from the depot is
worth less than a pad near it even if both cover the same amount of road.

The level starts you with two porters. **Tap the depot to hire another for 20 gold**, up to
six. A porter is not a cheap tower — it is throughput shared across everything you own, and
because well-fed towers kill more, it partly pays for itself in bounty.

## Architecture

The one structural rule: **`src/sim` never imports Phaser.**

```
src/
  sim/          pure TypeScript — no rendering concepts at all
    config.ts     every balance number, in one file
    path.ts       the lane as a polyline, walked by distance
    world.ts      the entire game: World.step(dt)
    waves.ts      wave table -> flat spawn schedule
  render/       Phaser — reads sim state, draws it, sends input back
    art.ts        every sprite, drawn with Canvas 2D at boot
    GameScene.ts  syncs world state to sprites, handles taps
    HudScene.ts   counters and the end-of-run panel
  dev/harness.ts  console tooling, stripped from production builds
```

`World.step()` runs on a fixed 60Hz accumulator, so behaviour never depends on frame rate.
It pushes to an event queue (`spawn`, `fire`, `hit`, `kill`, `leak`, `waveStart`, `gameOver`)
that the renderer drains each frame to fire off effects — that's how the simulation stays
free of anything visual.

The payoff is concrete: the balance can be swept headlessly (hundreds of full games in
milliseconds, no browser needed), and swapping Phaser for another engine would be a rewrite
of the smaller half.

### The lane is smoothed once, at the source

`config.ts` holds ten authored control points; `chaikin()` cuts their corners four times to
produce the ~145-point polyline that *is* the lane. Both the simulation and the terrain art
read that same smoothed result, so the road being walked and the road being drawn can never
drift apart.

Corner cutting was chosen over an interpolating spline: Catmull-Rom has to pass through every
control point, so a 90-degree corner stays a visibly tight pivot, and it can overshoot on
sharp turns. The trade is that the curve no longer touches the authored waypoints and the
route gets shorter — smoothing took this one from 1756px to 1682px — so **build pads are
positioned against the smoothed lane, never against the control points**. One pad was left
123px out with barely 200px of coverage until it was re-placed.

`Path.sample` uses a binary search rather than a linear scan for the same reason: 145
segments on the hot path, for every enemy every tick, across thousands of games in a sweep.

### Enemies store one number

An enemy's position is a single scalar — distance travelled along the path — rather than a
waypoint index plus an offset. `Path.sample(d)` turns it into `{x, y, angle}`. This makes
"which enemy is furthest along?" a plain numeric comparison, which is exactly the question
first-in-path targeting asks every frame.

### Overkill protection

Each enemy tracks `incoming`, the damage already committed by arrows in flight. Towers skip
targets that are already dead on arrival, so two towers don't put six arrows into a grunt
that needed two.

## Art

Every sprite is generated procedurally with the Canvas 2D API at boot — **there is not one
binary asset in the repo**. Consistent warm palette, dark warm outlines, light from the
top-left on every form, silhouettes that read at phone size.

Three techniques do most of the work in `art.ts`, and each replaced something that looked
wrong:

- **The lane is a polygon, not a stroke.** Both long edges are offset by a sum of three sine
  waves, and the closed shape is stroked once. An earlier version stamped overlapping discs
  along the edge and punched them back out to carve a scalloped border; wherever two discs
  met, the gap between their bites stayed filled with outline colour and the border came out
  as a heavy black chain. Describing the boundary directly gives one line at one weight, and
  makes amplitude and wavelength honest dials for how ragged the edge looks.
- **Grass thickness is a thin dark stroke along each edge, drawn before the road fills over
  it.** Only a rim survives, on the grass side. Widening it or saturating it stops reading as
  thickness and becomes a muddy halo.
- **Canopies are lobes painted back to front, each with its own rim** — not concentric rings
  inside one silhouette, which is what made the first pass look like stacked bubbles. Lobes
  are ellipses with randomised squash and rotation; perfect circles read as soap bubbles.

Fills of the same colour are drawn shape by shape rather than as a combined path, because
filling N same-coloured shapes is indistinguishable from filling their union. Only the
ordering of passes matters: every outline first, then every fill.

To move to real art, replace the loop in `GameScene.preload()` with
`this.load.atlas("game", "atlas.png", "atlas.json")` and add animation definitions. Keep the
texture keys and nothing else has to change — that's the reason the pipeline is shaped this
way now.

## Balance

Tuned by sweeping, not by feel. All 360 orderings of four-from-six pads currently give:

| | |
|---|---|
| Win rate | ~66% |
| Best achievable | 10/10 lives |
| Run length | 60–68s |
| Gold earnable vs. gold spendable | ~360 vs. 360 |

That last row is the point of the economy: a full clear earns almost exactly enough to fill
every pad and no more, so every coin is a decision. One tower always loses; two usually lose;
a perfect run exists but demands good pad choices early.

Supply changed this materially. Measured across the same 360 build orders, with two starting
porters and hiring available:

| opening | win rate | best |
|---|---|---|
| towers only, never hire | 18% | 8/10 |
| hire after the **1st** tower | 1% | 3/10 |
| hire after the **2nd** tower | **43%** | 10/10 |
| hire two after the 2nd | 24% | 10/10 |

That shape is the point: there is one right answer and it is wrong to go both too early and
too often. Hiring before your second tower guts the early defence; hiring twice starves your
tower count.

See `SUPPLY` in `config.ts` for the tuning, including why sizing supply from a tower's
theoretical rate of fire is the wrong instinct, and the measured band where hiring stops
being a decision in either direction.

Two geometry facts drive the whole thing, both documented in `config.ts`:

- A tower only fires while an enemy is inside its radius, so what matters is the **chord** its
  range cuts through the lane: `2 * sqrt(range² - offset²)`. Pads at 85px off the road with
  160 range cover ~270px of it; move them to 130px and it collapses to ~150px, which kills
  nothing.
- Pads are spaced by distance **along the lane**, not by screen position. Two pads that look
  far apart on screen can cover the same stretch of road, which makes the second one
  worthless.

## Dev harness

In dev builds the console gets:

```js
pump(120)                  // advance 120 frames by hand
play([0,1,2,3], 40)        // build those pads in order, run to t=40s
sweep([[0],[0,1]])         // headless runs — no rendering, hundreds per second
shoot('name')              // PNG to tools/shots/
balance.ENEMIES.grunt.hp   // live-tune; picked up by the next new World()
```

`shoot()` needs the capture sink running:

```bash
node tools/snapsink.mjs
```

`pump()` exists because a backgrounded tab never fires `requestAnimationFrame`. Note that
Phaser's tweens advance much slower than real time under manual pumping, so animation timing
in pumped screenshots is not representative — game logic is.

## Status

Working: path following, wave scheduling, build pads with tap-to-build, first-in-path
targeting, homing projectiles, gold economy, lives and leaks, win/lose with retry, hit sparks,
death puffs, floating gold, HP bars, wave banners, screen shake.

Not done yet:

- **Capacitor Android wrapper.** The SDK is installed but Android Studio bundles JDK 25,
  which is newer than the Android Gradle Plugin supports — expect to install Temurin 21.
- **Sound.** No audio at all.
- **Tower upgrades and a second tower type** — the obvious next mechanic.
- **iOS** shares this codebase but needs a Mac and an Apple developer account to build.
