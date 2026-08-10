import {
  BUILD_SLOTS,
  DEPOT,
  ECONOMY,
  ENEMIES,
  FIXED_STEP,
  MAX_FRAME_TIME,
  PATH_POINTS,
  SUPPLY,
  TOWER,
} from "./config";
import { Path } from "./path";
import type {
  BuildSlot,
  Enemy,
  GameEvent,
  GameStatus,
  Porter,
  Projectile,
  Tower,
} from "./types";
import { buildSpawnSchedule, type ScheduledSpawn } from "./waves";
import { dist } from "./vec";

/**
 * The whole game, with no rendering in it.
 *
 * Nothing here imports Phaser. The renderer reads this state and drains `events` each
 * frame; the simulation neither knows nor cares that it is being drawn. That separation is
 * what makes a future engine swap cheap, and it lets the balance logic be tested headlessly.
 */
export class World {
  readonly path: Path;
  readonly slots: BuildSlot[];

  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  porters: Porter[] = [];

  gold: number = ECONOMY.startGold;
  lives: number = ECONOMY.startLives;
  status: GameStatus = "playing";
  elapsed = 0;
  /** 1-based wave number for display; 0 before the first wave arrives. */
  currentWave = 0;

  /** Drained by the renderer every frame to trigger one-shot effects. */
  events: GameEvent[] = [];

  private schedule: ScheduledSpawn[];
  private nextSpawnIndex = 0;
  private accumulator = 0;
  private nextId = 1;

  constructor() {
    this.path = new Path(PATH_POINTS);
    this.slots = BUILD_SLOTS.map(([x, y], index) => ({ index, x, y, towerId: null }));
    this.schedule = buildSpawnSchedule();

    for (let i = 0; i < SUPPLY.startingPorters; i++) {
      this.spawnPorter();
    }
  }

  private spawnPorter(): Porter {
    const porter: Porter = {
      id: this.nextId++,
      x: DEPOT.x,
      y: DEPOT.y,
      angle: 0,
      carrying: 0,
      targetTowerId: null,
      loading: 0,
    };
    this.porters.push(porter);
    return porter;
  }

  get totalWaves(): number {
    return this.schedule.length === 0 ? 0 : this.schedule[this.schedule.length - 1]!.wave + 1;
  }

  /** Feed it real frame time; it runs whole fixed steps and banks the remainder. */
  update(dt: number): void {
    if (this.status !== "playing") return;

    this.accumulator += Math.min(dt, MAX_FRAME_TIME);
    while (this.accumulator >= FIXED_STEP) {
      this.step(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
      if (this.status !== "playing") {
        this.accumulator = 0;
        break;
      }
    }
  }

  canAfford(cost: number): boolean {
    return this.gold >= cost;
  }

  get sellValue(): number {
    return Math.floor(TOWER.cost * TOWER.sellRefund);
  }

  /** Dismantles a tower for a partial refund. Returns true if one was actually sold. */
  trySell(slotIndex: number): boolean {
    const slot = this.slots[slotIndex];
    if (!slot || slot.towerId === null) return false;

    const towerId = slot.towerId;
    this.towers = this.towers.filter((t) => t.id !== towerId);
    slot.towerId = null;
    this.gold += this.sellValue;

    // Any porter already walking a crate out to it turns back with the load still in hand;
    // `updatePorters` sees the missing tower and re-tasks it.
    this.events.push({ type: "sell", x: slot.x, y: slot.y, refund: this.sellValue });
    return true;
  }

  get canHirePorter(): boolean {
    return this.porters.length < SUPPLY.maxPorters;
  }

  /** Returns true if a porter was actually hired. */
  tryHirePorter(): boolean {
    if (!this.canHirePorter) return false;
    if (this.gold < SUPPLY.porterCost) return false;

    this.gold -= SUPPLY.porterCost;
    const porter = this.spawnPorter();
    this.events.push({ type: "hire", porterId: porter.id, x: porter.x, y: porter.y });
    return true;
  }

  /** Returns true if the tower was actually placed. */
  tryBuild(slotIndex: number): boolean {
    const slot = this.slots[slotIndex];
    if (!slot || slot.towerId !== null) return false;
    if (this.gold < TOWER.cost) return false;

    this.gold -= TOWER.cost;
    const tower: Tower = {
      id: this.nextId++,
      slotIndex,
      x: slot.x,
      y: slot.y,
      range: TOWER.range,
      damage: TOWER.damage,
      cooldown: 0,
      fireInterval: 1 / TOWER.fireRate,
      facing: 0,
      targetId: null,
      // Handed a crate on completion so a new tower is useful before the first porter walks
      // out to it. Building next to nothing would otherwise be a dead 10 seconds.
      ammo: SUPPLY.crateSize,
    };
    this.towers.push(tower);
    slot.towerId = tower.id;
    this.events.push({ type: "build", towerId: tower.id, x: slot.x, y: slot.y });
    return true;
  }

  // ---------------------------------------------------------------- simulation

  private step(dt: number): void {
    this.elapsed += dt;
    this.spawnDue();
    this.moveEnemies(dt);
    this.updateTowers(dt);
    this.updatePorters(dt);
    this.moveProjectiles(dt);
    this.checkEndConditions();
  }

  private spawnDue(): void {
    while (
      this.nextSpawnIndex < this.schedule.length &&
      this.schedule[this.nextSpawnIndex]!.time <= this.elapsed
    ) {
      const entry = this.schedule[this.nextSpawnIndex]!;
      this.nextSpawnIndex++;

      if (entry.wave + 1 > this.currentWave) {
        this.currentWave = entry.wave + 1;
        this.events.push({ type: "waveStart", wave: this.currentWave });
      }

      const stats = ENEMIES[entry.kind];
      const start = this.path.sample(0);
      const enemy: Enemy = {
        id: this.nextId++,
        kind: entry.kind,
        travelled: 0,
        speed: stats.speed,
        hp: stats.hp,
        maxHp: stats.hp,
        x: start.x,
        y: start.y,
        angle: start.angle,
        radius: stats.radius,
        incoming: 0,
        alive: true,
      };
      this.enemies.push(enemy);
      this.events.push({ type: "spawn", enemyId: enemy.id });
    }
  }

  private moveEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      enemy.travelled += enemy.speed * dt;

      if (enemy.travelled >= this.path.length) {
        enemy.alive = false;
        const damage = ENEMIES[enemy.kind].leakDamage;
        this.lives = Math.max(0, this.lives - damage);
        this.events.push({ type: "leak", x: enemy.x, y: enemy.y, damage });
        continue;
      }

      const sample = this.path.sample(enemy.travelled);
      enemy.x = sample.x;
      enemy.y = sample.y;
      enemy.angle = sample.angle;
    }

    this.enemies = this.enemies.filter((e) => e.alive);
  }

  private updateTowers(dt: number): void {
    for (const tower of this.towers) {
      tower.cooldown = Math.max(0, tower.cooldown - dt);

      const target = this.pickTarget(tower);
      tower.targetId = target?.id ?? null;
      if (!target) continue;

      // Track the target even while reloading or empty, so a dry tower visibly still wants
      // to shoot rather than looking broken.
      tower.facing = Math.atan2(target.y - tower.y, target.x - tower.x);

      if (tower.cooldown > 0) continue;
      if (tower.ammo < SUPPLY.ammoPerShot) continue;

      tower.ammo -= SUPPLY.ammoPerShot;
      if (tower.ammo < SUPPLY.ammoPerShot) {
        this.events.push({ type: "dry", towerId: tower.id, x: tower.x, y: tower.y });
      }
      tower.cooldown = tower.fireInterval;
      target.incoming += tower.damage;
      // Arrows leave the bow, not the foot of the tower.
      const muzzleY = tower.y - TOWER.muzzleHeight;
      this.projectiles.push({
        id: this.nextId++,
        x: tower.x,
        y: muzzleY,
        speed: TOWER.projectileSpeed,
        damage: tower.damage,
        targetId: target.id,
        angle: tower.facing,
      });
      this.events.push({
        type: "fire",
        towerId: tower.id,
        x: tower.x,
        y: muzzleY,
        angle: tower.facing,
      });
    }
  }

  /**
   * First-in-path targeting: of the enemies in range, shoot whichever is closest to the
   * keep. Enemies with enough damage already in flight to kill them are skipped, so two
   * towers don't dump six arrows into a grunt that needed two.
   */
  private pickTarget(tower: Tower): Enemy | null {
    let best: Enemy | null = null;
    const rangeSq = tower.range * tower.range;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (enemy.hp - enemy.incoming <= 0) continue;

      const dx = enemy.x - tower.x;
      const dy = enemy.y - tower.y;
      if (dx * dx + dy * dy > rangeSq) continue;

      if (best === null || enemy.travelled > best.travelled) {
        best = enemy;
      }
    }

    return best;
  }

  /**
   * Porters shuttle between the depot and whichever tower is emptiest.
   *
   * A porter claims its destination for the whole trip. Without that claim every idle porter
   * picks the same lowest tower on the same tick, they all arrive together, and the rest of
   * the line stays dry — the claim is what spreads deliveries out.
   */
  private updatePorters(dt: number): void {
    for (const porter of this.porters) {
      if (porter.carrying > 0) {
        const tower = this.towers.find((t) => t.id === porter.targetTowerId);
        if (!tower) {
          // Destination vanished; dump the load and go back for orders.
          porter.carrying = 0;
          porter.targetTowerId = null;
          continue;
        }
        if (this.stepToward(porter, tower.x, tower.y, dt)) {
          const delivered = Math.min(porter.carrying, SUPPLY.towerAmmoMax - tower.ammo);
          tower.ammo += delivered;
          porter.carrying = 0;
          porter.targetTowerId = null;
          this.events.push({ type: "deliver", x: tower.x, y: tower.y, amount: delivered });
        }
        continue;
      }

      if (!this.stepToward(porter, DEPOT.x, DEPOT.y, dt)) continue;

      if (porter.loading > 0) {
        porter.loading -= dt;
        continue;
      }

      const target = this.pickResupplyTarget();
      if (!target) continue; // Nothing needs crates; wait at the depot.

      porter.carrying = SUPPLY.crateSize;
      porter.targetTowerId = target.id;
      porter.loading = SUPPLY.loadTime;
    }
  }

  /** Moves a porter toward a point; returns true once it has arrived. */
  private stepToward(porter: Porter, x: number, y: number, dt: number): boolean {
    const dx = x - porter.x;
    const dy = y - porter.y;
    const distance = Math.hypot(dx, dy);
    const travel = SUPPLY.porterSpeed * dt;

    if (distance <= travel) {
      porter.x = x;
      porter.y = y;
      return true;
    }

    porter.angle = Math.atan2(dy, dx);
    porter.x += (dx / distance) * travel;
    porter.y += (dy / distance) * travel;
    return false;
  }

  /** Emptiest unclaimed tower, with distance from the depot as the tie-break. */
  private pickResupplyTarget(): Tower | null {
    const claimed = new Set(
      this.porters.map((p) => p.targetTowerId).filter((id): id is number => id !== null),
    );

    let best: Tower | null = null;
    let bestScore = Infinity;

    for (const pass of [0, 1]) {
      for (const tower of this.towers) {
        if (tower.ammo >= SUPPLY.towerAmmoMax) continue;
        // First pass considers only unclaimed towers; second pass allows doubling up so a
        // porter is never left idle while something is running dry.
        if (pass === 0 && claimed.has(tower.id)) continue;

        const score =
          tower.ammo / SUPPLY.towerAmmoMax +
          dist(DEPOT.x, DEPOT.y, tower.x, tower.y) / 4000;
        if (score < bestScore) {
          bestScore = score;
          best = tower;
        }
      }
      if (best) return best;
    }

    return null;
  }

  private moveProjectiles(dt: number): void {
    const survivors: Projectile[] = [];

    for (const projectile of this.projectiles) {
      const target = this.enemies.find((e) => e.id === projectile.targetId && e.alive);
      if (!target) continue; // Target already died; the arrow is spent.

      const dx = target.x - projectile.x;
      const dy = target.y - projectile.y;
      const distance = Math.hypot(dx, dy);
      const travel = projectile.speed * dt;
      projectile.angle = Math.atan2(dy, dx);

      if (distance <= travel + target.radius) {
        this.applyDamage(target, projectile.damage);
        continue;
      }

      projectile.x += (dx / distance) * travel;
      projectile.y += (dy / distance) * travel;
      survivors.push(projectile);
    }

    this.projectiles = survivors;
  }

  private applyDamage(enemy: Enemy, damage: number): void {
    enemy.incoming = Math.max(0, enemy.incoming - damage);
    enemy.hp -= damage;
    this.events.push({ type: "hit", x: enemy.x, y: enemy.y, damage });

    if (enemy.hp <= 0) {
      enemy.alive = false;
      const bounty = ENEMIES[enemy.kind].bounty;
      this.gold += bounty;
      this.events.push({ type: "kill", x: enemy.x, y: enemy.y, bounty });
      this.enemies = this.enemies.filter((e) => e.alive);
    }
  }

  private checkEndConditions(): void {
    if (this.lives <= 0) {
      this.status = "lost";
      this.events.push({ type: "gameOver", status: "lost" });
      return;
    }

    const allSpawned = this.nextSpawnIndex >= this.schedule.length;
    if (allSpawned && this.enemies.length === 0) {
      this.status = "won";
      this.events.push({ type: "gameOver", status: "won" });
    }
  }
}

/** Distance helper re-exported for the renderer's range previews. */
export { dist };
