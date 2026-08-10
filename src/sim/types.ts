import type { EnemyKind } from "./config";

export interface Enemy {
  id: number;
  kind: EnemyKind;
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
}

export interface Tower {
  id: number;
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
}

/** Hauls crates from the depot to whichever tower needs them most. */
export interface Porter {
  id: number;
  x: number;
  y: number;
  angle: number;
  /** Rounds being carried. Zero means it is walking back to the depot. */
  carrying: number;
  /** Claimed while en route, so porters spread across towers instead of swarming one. */
  targetTowerId: number | null;
  /** Seconds left loading at the depot. */
  loading: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  speed: number;
  damage: number;
  targetId: number;
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
  | { type: "fire"; towerId: number; x: number; y: number; angle: number }
  | { type: "hit"; x: number; y: number; damage: number }
  | { type: "kill"; x: number; y: number; bounty: number }
  | { type: "leak"; x: number; y: number; damage: number }
  | { type: "build"; towerId: number; x: number; y: number }
  | { type: "deliver"; x: number; y: number; amount: number }
  | { type: "hire"; porterId: number; x: number; y: number }
  | { type: "sell"; x: number; y: number; refund: number }
  | { type: "dry"; towerId: number; x: number; y: number }
  | { type: "gameOver"; status: GameStatus };
