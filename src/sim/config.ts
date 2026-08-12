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

const LEVEL_2_UPPER_CONTROL: ReadonlyArray<readonly [number, number]> = [
  [-50, 5], [50, 45], [100, 78], [150, 115], [200, 145], [300, 183],
  [400, 198], [500, 188], [600, 187], [700, 220], [760, 270], [810, 325],
  [850, 370], [900, 346], [950, 332], [1000, 316], [1050, 282], [1100, 223],
  [1130, 190], [1160, 170],
];

const LEVEL_2_LOWER_CONTROL: ReadonlyArray<readonly [number, number]> = [
  [-50, 700], [50, 630], [100, 598], [200, 574], [300, 540], [400, 513],
  [500, 520], [600, 531], [700, 519], [760, 495], [810, 445], [850, 370],
  [900, 346], [950, 332], [1000, 316], [1050, 282], [1100, 223], [1130, 190],
  [1160, 170],
];

const LEVEL_3_UPPER_CONTROL: ReadonlyArray<readonly [number, number]> = [
  [-50, 60], [0, 78], [50, 98], [100, 125], [150, 158], [200, 185],
  [250, 205], [300, 220], [350, 228], [400, 238], [450, 255], [500, 280],
  [550, 315], [600, 345], [640, 360], [680, 340], [720, 315], [760, 290],
  [800, 270], [850, 255], [900, 245], [950, 235], [1000, 225], [1050, 205],
  [1090, 182], [1125, 158],
];

const LEVEL_3_LOWER_CONTROL: ReadonlyArray<readonly [number, number]> = [
  [-50, 690], [0, 665], [50, 635], [100, 605], [150, 575], [200, 550],
  [250, 530], [300, 512], [350, 500], [400, 492], [450, 485], [500, 470],
  [540, 440], [580, 405], [620, 370], [640, 360], [680, 385], [720, 410],
  [760, 430], [800, 450], [850, 465], [900, 480], [950, 490], [1000, 510],
  [1035, 530], [1065, 550],
];

const LEVEL_4_UPPER_CONTROL: ReadonlyArray<readonly [number, number]> = [
  [-55, 348], [70, 348], [180, 348], [275, 348], [310, 340], [340, 295],
  [390, 245], [455, 195], [550, 165], [650, 160], [755, 175], [845, 215],
  [915, 280], [970, 345], [1060, 350], [1180, 350], [1310, 350],
];

const LEVEL_4_LOWER_CONTROL: ReadonlyArray<readonly [number, number]> = [
  [-55, 348], [70, 348], [180, 348], [275, 348], [310, 356], [340, 390],
  [390, 440], [470, 490], [580, 525], [700, 530], [820, 495], [900, 440],
  [950, 380], [970, 345], [1060, 350], [1180, 350], [1310, 350],
];

const LEVEL_5_CONTROL: ReadonlyArray<readonly [number, number]> = [
  // Traced from the centre of the final painted road. Dense samples are intentional: this
  // S-curve has broad bends, and smoothing a sparse control polygon cuts across their inner
  // shoulders, making units visibly walk beside the road.
  [-60, 410], [80, 410], [160, 408], [230, 394], [275, 371], [310, 335],
  [335, 290], [355, 240], [385, 196], [430, 166], [480, 151], [540, 144],
  [600, 147], [660, 169], [705, 202], [740, 246], [765, 300], [785, 355],
  [808, 410], [840, 455], [880, 480], [925, 488], [965, 470], [1000, 430],
  [1025, 390], [1060, 362], [1110, 350], [1180, 350], [1260, 350], [1320, 350],
];

export interface LevelLayout {
  terrainKey: string;
  paths: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  buildSlots: ReadonlyArray<readonly [number, number]>;
  depot: { x: number; y: number };
  startingPorters: number;
  startGold: number;
  bombTowerAvailable: boolean;
  incendiaryPorterAvailable: boolean;
  airshipPorterAvailable: boolean;
  towerUpgradesAvailable: boolean;
}

export const LEVEL_LAYOUTS: Record<number, LevelLayout> = {
  1: {
    terrainKey: "terrain-1",
    paths: [PATH_POINTS],
    buildSlots: BUILD_SLOTS,
    depot: DEPOT,
    startingPorters: 2,
    startGold: 110,
    bombTowerAvailable: false,
    incendiaryPorterAvailable: false,
    airshipPorterAvailable: false,
    towerUpgradesAvailable: false,
  },
  2: {
    terrainKey: "terrain-2",
    paths: [chaikin(LEVEL_2_UPPER_CONTROL, 2), chaikin(LEVEL_2_LOWER_CONTROL, 2)],
    buildSlots: [
      [390, 122], [727, 130], [253, 253], [230, 467],
      [421, 589], [926, 260], [1033, 390], [926, 444],
    ],
    depot: { x: 566, y: 352 },
    startingPorters: 2,
    startGold: 180,
    bombTowerAvailable: true,
    incendiaryPorterAvailable: false,
    airshipPorterAvailable: false,
    towerUpgradesAvailable: false,
  },
  3: {
    terrainKey: "terrain-3",
    // The painted roads already contain their final smooth curves. Dense samples plus one
    // light pass keep units centred; the old sparse/two-pass paths cut across road edges.
    paths: [chaikin(LEVEL_3_UPPER_CONTROL, 1), chaikin(LEVEL_3_LOWER_CONTROL, 1)],
    buildSlots: [
      [364, 158], [533, 371], [841, 160], [201, 300], [1024, 313],
      [933, 419], [201, 437], [770, 371], [652, 475],
    ],
    depot: { x: 391, y: 366 },
    startingPorters: 2,
    startGold: 280,
    bombTowerAvailable: true,
    incendiaryPorterAvailable: true,
    airshipPorterAvailable: false,
    towerUpgradesAvailable: false,
  },
  4: {
    terrainKey: "terrain-4",
    paths: [chaikin(LEVEL_4_UPPER_CONTROL, 1), chaikin(LEVEL_4_LOWER_CONTROL, 1)],
    buildSlots: [
      [320, 210], [527, 107], [787, 107], [1030, 265],
      [320, 475], [527, 605], [779, 605], [1030, 450],
    ],
    // The depot is trapped inside the road island while every build pad is outside. Ground
    // porters therefore cross an enemy branch on every delivery and return trip.
    depot: { x: 640, y: 350 },
    startingPorters: 2,
    // Level 4 is the first logistics-under-attack map. The smaller purse forces a choice
    // between early firepower and the safer (but slower) airship porter.
    startGold: 300,
    bombTowerAvailable: true,
    incendiaryPorterAvailable: true,
    airshipPorterAvailable: true,
    towerUpgradesAvailable: false,
  },
  5: {
    terrainKey: "terrain-5",
    // One light pass removes facets without moving the route away from the painted centre.
    paths: [chaikin(LEVEL_5_CONTROL, 1)],
    buildSlots: [
      [348, 109], [650, 92], [521, 278], [864, 230],
      [930, 305], [230, 483], [760, 535], [980, 565],
    ],
    depot: { x: 614, y: 382 },
    startingPorters: 2,
    startGold: 230,
    bombTowerAvailable: true,
    incendiaryPorterAvailable: true,
    airshipPorterAvailable: true,
    towerUpgradesAvailable: true,
  },
};

export function getLevelLayout(level: number): LevelLayout {
  return LEVEL_LAYOUTS[level] ?? LEVEL_LAYOUTS[1]!;
}

/**
 * Ammunition logistics. Towers burn a round per shot and cannot fire empty, so a tower's real
 * output is capped by how fast porters walk crates out to it.
 *
 * Sizing this from "an archer fires 2.4 shots/s" is the trap — it gives a demand of ~10/s for
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
  incendiaryPorterCost: 45,
  airshipPorterCost: 45,
  /** Ceiling on hires. Past this, extra porters queue at the depot with nothing to carry. */
  maxPorters: 6,
  porterSpeed: 125,
  // Safer than a ground porter, but deliberately slower and burdened by take-off/landing.
  airshipSpeed: 115,
  airshipVerticalTime: 0.6,
  fleeSpeedMultiplier: 1.7,
  /** How much one porter hauls per trip. */
  crateSize: 9,
  /** A tower's magazine. Also what it is handed on completion, so it opens fire immediately. */
  towerAmmoMax: 18,
  incendiaryAmmoMax: 9,
  incendiaryCrateSize: 3,
  incendiaryDamageMultiplier: 1.65,
  ammoPerShot: 1,
  bombAmmoPerShot: 2,
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
  fireRate: 2.4,
  damage: 13,
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

export const BOMB_TOWER = {
  name: "Bomb Tower",
  cost: 80,
  sellRefund: 0.5,
  range: 155,
  fireRate: 0.6,
  damage: 27,
  splashRadius: 68,
  projectileSpeed: 250,
  muzzleHeight: 58,
} as const;

export const TOWER_UPGRADES = {
  archer: {
    name: "Archer Tower II",
    upgradeCost: 75,
    range: 190,
    fireRate: 3,
    damage: 23,
    projectileSpeed: 490,
    muzzleHeight: 68,
    splashRadius: 0,
  },
  bomb: {
    name: "Bomb Tower II",
    upgradeCost: 95,
    range: 165,
    fireRate: 0.65,
    damage: 34,
    projectileSpeed: 270,
    muzzleHeight: 64,
    splashRadius: 76,
  },
} as const;

export type TowerKind = "archer" | "bomb";

export const TOWER_STATS = {
  archer: TOWER,
  bomb: BOMB_TOWER,
} as const;

export function towerStatsFor(kind: TowerKind, level: 1 | 2) {
  return level === 2 ? TOWER_UPGRADES[kind] : TOWER_STATS[kind];
}

export type EnemyKind = "peasant" | "grunt" | "elf";

export const ENEMIES: Record<
  EnemyKind,
  { hp: number; speed: number; bounty: number; leakDamage: number; radius: number }
> = {
  // Peasants rush the lane while trained grunts trade some speed for light protection.
  // Bounties are deliberately lean: a full clear earns almost exactly enough to fill all six
  // pads and no more, so every coin is a decision. Swept across 360 build orders these
  // values split 186 wins / 174 losses — a perfect run is possible, a careless one is fatal.
  peasant: { hp: 40, speed: 125, bounty: 6, leakDamage: 1, radius: 14 },
  grunt: { hp: 105, speed: 95, bounty: 10, leakDamage: 1, radius: 17 },
  // A lone elf leads each reinforced wave. Extra health gives the specialist enough time
  // to threaten supply before the player's front tower deletes it with the first volley.
  elf: { hp: 110, speed: 108, bounty: 11, leakDamage: 1, radius: 15 },
};

export const ELF_ATTACK = {
  strikeRange: 155,
  cooldown: 1.45,
  animationTime: 0.58,
} as const;

/** Simulation runs at a fixed step so behaviour never depends on frame rate. */
export const FIXED_STEP = 1 / 60;

/** Guard against the spiral-of-death after a tab stall: never simulate more than this per frame. */
export const MAX_FRAME_TIME = 0.25;
