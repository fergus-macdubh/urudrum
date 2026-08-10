/**
 * Every balance number lives here — tweak a value, reload the page, feel the difference.
 */

import { chaikin } from "./curve";

export const VIEW = { width: 1280, height: 720 } as const;

/**
 * The lane, traced off the painted map in `public/sprites/map.png`.
 *
 * The art leads now, not the code. These points were read out of the painting itself — its
 * road was sampled by colour on a 24px grid and the centre of each run converted with
 * `gameX = imgX * 0.8333`, `gameY = (imgY - 40) * 0.8333`, which is the crop that turns the
 * 1536x1024 render into the 1280x720 board. Move the map and these have to be re-traced;
 * they are not free parameters.
 */
const PATH_CONTROL: ReadonlyArray<readonly [number, number]> = [
  [-60, 207],
  [230, 207],
  [270, 237],
  [310, 277],
  [340, 317],
  [360, 377],
  [360, 457],
  [380, 507],
  [410, 547],
  [460, 587],
  [530, 617],
  [667, 622],
  [792, 617],
  [842, 592],
  [883, 557],
  [910, 517],
  [930, 457],
  [940, 377],
  [960, 337],
  [980, 297],
  [1030, 257],
  [1080, 217],
  [1120, 187],
  [1160, 147],
  [1175, 122],
];

/**
 * The lane enemies actually walk.
 *
 * Only two smoothing passes now, down from four. The control points follow a road that is
 * already curved, so heavy corner-cutting would pull the lane off the painted road it is
 * meant to sit on; two passes just take the faceting off.
 */
export const PATH_POINTS: ReadonlyArray<readonly [number, number]> = chaikin(PATH_CONTROL, 2);

/**
 * Where the player may build, spread across four separate stretches of the lane.
 *
 * The offset from the path matters more than it looks. A tower only fires while an enemy is
 * inside its radius, so what counts is the chord its range cuts through the lane:
 * `2 * sqrt(range^2 - offset^2)`. At ~85px off the lane with 160 range that is ~270px of
 * covered road; push the pads out to 130px and it collapses to ~150px, which is not enough
 * fire time to kill anything. Keep these hugging the road.
 *
 * These are no longer free parameters. The clearings are painted into `map.png`, so these are
 * the centroids of the six tan blobs in it, found by flood-filling the image rather than read
 * off a grid by eye — the earlier estimates were 6-14px out and the towers sat visibly off
 * their patches. Repaint the map and they have to be re-measured.
 */
export const BUILD_SLOTS: ReadonlyArray<readonly [number, number]> = [
  [149, 299],
  [251, 410],
  [538, 510],
  [854, 691],
  [1046, 377],
  [1150, 307],
];

/** Where crates come from. The large clearing painted in the middle of the map. */
export const DEPOT = { x: 680, y: 402 } as const;

/**
 * Ammunition logistics. Towers burn a round per shot and cannot fire empty, so a tower's real
 * output is capped by how fast porters walk crates out to it.
 *
 * Sizing this from "a tower fires 2.2 shots/s" is the trap — it gives a demand of ~9/s for
 * four towers and suggests generous supply. Towers only fire while something is inside their
 * radius, so actual demand across a whole run is nearer 3/s. The first pass (3 porters,
 * 12-round crates, 24-round magazines) supplied roughly double that, and towers sat dry about
 * 1% of the time: visible porters, zero effect on the outcome. The win rate did not move a
 * single point.
 *
 * These numbers were picked by measuring dry time directly. Roughly: under 5% and the
 * mechanic is decorative; above 30% no build order survives at all. ~13% is the band where
 * towers noticeably run out during heavy waves, far pads are genuinely worse than near ones,
 * and a clean run can still finish without losing a life.
 *
 * The magazine matters as much as throughput — it is the buffer that hides supply gaps. Big
 * magazines smooth everything out and quietly turn the mechanic back off.
 *
 * With hiring in play, the number that actually matters is the *gap* between playing towers
 * only and buying one porter after the second tower. Measured across 360 build orders:
 *
 *   crate  8 / mag 16 :  5% vs 33%  — hiring is not a choice, it is mandatory
 *   crate  9 / mag 18 : 18% vs 43%  — hiring is clearly right, skipping it is merely bad
 *   crate 11 / mag 20 : 49% vs 51%  — hiring is pointless again
 *
 * Push supply up and the mechanic quietly switches itself off; pull it down and the level
 * turns into a single forced opening. The middle row is what these values are set to.
 */
export const SUPPLY = {
  /**
   * How many porters a level hands you for free. A per-level dial: a map with long hauls or
   * scattered pads can open with more, a tight one with fewer.
   */
  startingPorters: 2,
  /**
   * Hiring is deliberately cheap next to a tower's 60. A porter is not a third of a tower —
   * it is throughput shared across every tower you own, so the choice "another tower, or
   * keep the ones I have actually firing?" only stays interesting while the price is low
   * enough to be a real alternative rather than an obvious luxury.
   */
  porterCost: 20,
  /** Ceiling on hires. Past this, extra porters queue at the depot with nothing to carry. */
  maxPorters: 6,
  porterSpeed: 125,
  /** How much one porter hauls per trip. */
  crateSize: 9,
  /** A tower's magazine. Also what it is handed on completion, so it opens fire immediately. */
  towerAmmoMax: 18,
  ammoPerShot: 1,
  /** Seconds spent loading at the depot. Keeps porters from teleporting between trips. */
  loadTime: 0.4,
} as const;

export const ECONOMY = {
  /**
   * 110 buys one tower with 50 banked — deliberately not a round two towers.
   *
   * At 100 a single opening tower cannot clear wave 1 no matter where it goes (the maths:
   * four 40hp grunts need ~6.6s of fire, one pad only ever gets ~5s), so a flawless run was
   * impossible. At 120 every build order wins and the map stops asking anything. 110 leaves
   * a perfect run reachable while a third of build orders still lose.
   */
  startGold: 110,
  startLives: 10,
} as const;

export const TOWER = {
  name: "Archer Tower",
  cost: 60,
  /**
   * Raised from 160 when the painted map arrived.
   *
   * Not a difficulty tweak — a geometric correction. The clearings are painted into the map,
   * so the pads sit where the artist put them: 95-116px off the road rather than the 85px the
   * hand-placed ones used. That alone cut each tower's covered stretch of road from ~270px to
   * 221-257px and dropped the win rate from 41% to 25%. 170 restores the coverage the layout
   * was balanced around; the pads themselves cannot move without breaking the artwork.
   */
  /**
   * Fraction of the price handed back when a tower is dismantled.
   *
   * Half is the genre standard and is deliberately a loss: selling is for correcting a bad
   * placement, not a free way to shuffle towers around the map every wave.
   */
  sellRefund: 0.5,
  range: 170,
  /** Shots per second. */
  fireRate: 2.2,
  damage: 11,
  projectileSpeed: 450,
  /**
   * How far above the tower's position on the map the archer's bow sits.
   *
   * Arrows leave from here rather than from the tower's feet. It lives in the simulation, not
   * the renderer, because the projectile's whole flight is simulated - spawning it at the
   * base and only drawing it higher would make it visibly curve as it flew.
   */
  muzzleHeight: 62,
} as const;

export type EnemyKind = "grunt" | "brute";

export const ENEMIES: Record<
  EnemyKind,
  { hp: number; speed: number; bounty: number; leakDamage: number; radius: number }
> = {
  // The lane is ~1776px, so these speeds put a grunt on the board for ~14s and a brute ~22s.
  // Bounties are deliberately lean: a full clear earns almost exactly enough to fill all six
  // pads and no more, so every coin is a decision. Swept across 360 build orders these
  // values split 186 wins / 174 losses — a perfect run is possible, a careless one is fatal.
  grunt: { hp: 40, speed: 125, bounty: 6, leakDamage: 1, radius: 14 },
  brute: { hp: 170, speed: 80, bounty: 15, leakDamage: 2, radius: 20 },
};

/** Simulation runs at a fixed step so behaviour never depends on frame rate. */
export const FIXED_STEP = 1 / 60;

/** Guard against the spiral-of-death after a tab stall: never simulate more than this per frame. */
export const MAX_FRAME_TIME = 0.25;
