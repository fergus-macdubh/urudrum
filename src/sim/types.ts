import type { EnemyKind, TowerKind } from "./config";

export type PorterKind = "normal" | "incendiary" | "airship";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pathIndex: number;
  /** Distance walked along the path, in pixels. */
  travelled: number;
  speed: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  angle: number;
  radius: number;
  /** Damage already committed by in-flight projectiles, so towers don't overkill. */
  incoming: number;
  alive: boolean;
  /** Reserved attack target state; elves themselves remain on the lane. */
  porterTargetId: number | null;
  attackCooldown: number;
  attackTimer: number;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  level: 1 | 2;
  slotIndex: number;
  x: number;
  y: number;
  range: number;
  damage: number;
  /** Seconds until this tower may fire again. */
  cooldown: number;
  fireInterval: number;
  /** Turret facing, in radians. Purely cosmetic, but the sim owns it so replays stay faithful. */
  facing: number;
  targetId: number | null;
  /** Rounds on hand. At zero the tower tracks targets but cannot shoot. */
  ammo: number;
  /** Separate, smaller magazine delivered by incendiary porters. */
  incendiaryAmmo: number;
  /** Becomes true after the first special delivery, revealing the second ammo strip. */
  incendiaryMagazineActive: boolean;
  splashRadius: number;
}

/** Hauls crates from the depot to whichever tower needs them most. */
export interface Porter {
  id: number;
  kind: PorterKind;
  x: number;
  y: number;
  angle: number;
  /** Rounds being carried. Zero means it is walking back to the depot. */
  carrying: number;
  /** Claimed while en route, so porters spread across towers instead of swarming one. */
  targetTowerId: number | null;
  /** Seconds left loading at the depot. */
  loading: number;
  /** An attacked ground porter drops its crate and sprints home before loading again. */
  fleeing: boolean;
  /** 0 while lowered for service, 1 at cruising height. */
  altitude: number;
  airshipService: "none" | "loweringDepot" | "raisingDepot" | "loweringTower" | "raisingTower";
}

export interface Projectile {
  id: number;
  kind: TowerKind;
  x: number;
  y: number;
  speed: number;
  damage: number;
  targetId: number;
  targetX: number;
  targetY: number;
  splashRadius: number;
  incendiary: boolean;
  flight: number;
  flightDistance: number;
  angle: number;
}

export interface BuildSlot {
  index: number;
  x: number;
  y: number;
  towerId: number | null;
}

export type GameStatus = "playing" | "won" | "lost";

export type GameEvent =
  | { type: "waveStart"; wave: number }
  | { type: "spawn"; enemyId: number }
  | { type: "fire"; towerId: number; towerKind: TowerKind; incendiary: boolean; x: number; y: number; angle: number }
  | { type: "hit"; towerKind: TowerKind; incendiary: boolean; x: number; y: number; damage: number }
  | { type: "explode"; x: number; y: number; radius: number }
  | { type: "kill"; x: number; y: number; bounty: number }
  | { type: "leak"; x: number; y: number; damage: number }
  | { type: "build"; towerId: number; x: number; y: number }
  | { type: "upgrade"; towerId: number; towerKind: TowerKind; x: number; y: number }
  | { type: "deliver"; porterKind: PorterKind; x: number; y: number; amount: number }
  | { type: "hire"; porterId: number; porterKind: PorterKind; x: number; y: number }
  | { type: "porterAttacked"; porterId: number; x: number; y: number }
  | { type: "elfFire"; x: number; y: number; targetX: number; targetY: number }
  | { type: "sell"; x: number; y: number; refund: number }
  | { type: "dry"; towerId: number; x: number; y: number }
  | { type: "gameOver"; status: GameStatus };
