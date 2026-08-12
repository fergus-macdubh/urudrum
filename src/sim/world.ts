import {
  BOMB_TOWER,
  ECONOMY,
  ELF_ATTACK,
  ENEMIES,
  FIXED_STEP,
  getLevelLayout,
  MAX_FRAME_TIME,
  SUPPLY,
  TOWER_UPGRADES,
  TOWER_STATS,
  towerStatsFor,
} from "./config";
import type { TowerKind } from "./config";
import { Path } from "./path";
import type {
  BuildSlot,
  Enemy,
  GameEvent,
  GameStatus,
  Porter,
  PorterKind,
  Projectile,
  Tower,
} from "./types";
import { buildSpawnSchedule, type ScheduledSpawn, wavesForLevel } from "./waves";
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
  readonly paths: Path[];
  readonly slots: BuildSlot[];
  readonly depot: { x: number; y: number };
  readonly terrainKey: string;
  readonly bombTowerAvailable: boolean;
  readonly incendiaryPorterAvailable: boolean;
  readonly airshipPorterAvailable: boolean;
  readonly towerUpgradesAvailable: boolean;

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
  private randomState = 0x51f15e;

  constructor(level = 1) {
    const layout = getLevelLayout(level);
    this.paths = layout.paths.map((points) => new Path(points));
    this.path = this.paths[0]!;
    this.depot = layout.depot;
    this.terrainKey = layout.terrainKey;
    this.bombTowerAvailable = layout.bombTowerAvailable;
    this.incendiaryPorterAvailable = layout.incendiaryPorterAvailable;
    this.airshipPorterAvailable = layout.airshipPorterAvailable;
    this.towerUpgradesAvailable = layout.towerUpgradesAvailable;
    this.gold = layout.startGold;
    this.slots = layout.buildSlots.map(([x, y], index) => ({ index, x, y, towerId: null }));
    this.schedule = buildSpawnSchedule(wavesForLevel(level));

    for (let i = 0; i < layout.startingPorters; i++) {
      this.spawnPorter();
    }
  }

  private spawnPorter(kind: PorterKind = "normal"): Porter {
    const porter: Porter = {
      id: this.nextId++,
      kind,
      x: this.depot.x,
      y: this.depot.y,
      angle: 0,
      carrying: 0,
      targetTowerId: null,
      loading: 0,
      fleeing: false,
      altitude: kind === "airship" ? 0 : 0,
      airshipService: "none",
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

  sellValueFor(slotIndex: number): number {
    const slot = this.slots[slotIndex];
    if (!slot || slot.towerId === null) return 0;
    const tower = this.towers.find((t) => t.id === slot.towerId);
    if (!tower) return 0;
    const stats = TOWER_STATS[tower.kind];
    const invested = stats.cost + (tower.level === 2 ? TOWER_UPGRADES[tower.kind].upgradeCost : 0);
    return Math.floor(invested * stats.sellRefund);
  }

  upgradeCostFor(slotIndex: number): number {
    const slot = this.slots[slotIndex];
    if (!slot || slot.towerId === null) return 0;
    const tower = this.towers.find((candidate) => candidate.id === slot.towerId);
    if (!tower || tower.level === 2) return 0;
    return TOWER_UPGRADES[tower.kind].upgradeCost;
  }

  /** Improves an existing tower in place while preserving both magazines. */
  tryUpgrade(slotIndex: number): boolean {
    if (!this.towerUpgradesAvailable) return false;
    const slot = this.slots[slotIndex];
    if (!slot || slot.towerId === null) return false;
    const tower = this.towers.find((candidate) => candidate.id === slot.towerId);
    if (!tower || tower.level === 2) return false;

    const stats = TOWER_UPGRADES[tower.kind];
    if (this.gold < stats.upgradeCost) return false;
    this.gold -= stats.upgradeCost;
    tower.level = 2;
    tower.range = stats.range;
    tower.damage = stats.damage;
    tower.fireInterval = 1 / stats.fireRate;
    tower.splashRadius = stats.splashRadius;
    tower.cooldown = Math.min(tower.cooldown, tower.fireInterval);
    this.events.push({ type: "upgrade", towerId: tower.id, towerKind: tower.kind, x: tower.x, y: tower.y });
    return true;
  }

  /** Dismantles a tower for a partial refund. Returns true if one was actually sold. */
  trySell(slotIndex: number): boolean {
    const slot = this.slots[slotIndex];
    if (!slot || slot.towerId === null) return false;

    const towerId = slot.towerId;
    const refund = this.sellValueFor(slotIndex);
    this.towers = this.towers.filter((t) => t.id !== towerId);
    slot.towerId = null;
    this.gold += refund;

    // Any porter already walking a crate out to it turns back with the load still in hand;
    // `updatePorters` sees the missing tower and re-tasks it.
    this.events.push({ type: "sell", x: slot.x, y: slot.y, refund });
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
    this.events.push({ type: "hire", porterId: porter.id, porterKind: porter.kind, x: porter.x, y: porter.y });
    return true;
  }

  /** Hires the premium porter that feeds a separate incendiary magazine. */
  tryHireIncendiaryPorter(): boolean {
    if (!this.incendiaryPorterAvailable || !this.canHirePorter) return false;
    if (this.gold < SUPPLY.incendiaryPorterCost) return false;

    this.gold -= SUPPLY.incendiaryPorterCost;
    const porter = this.spawnPorter("incendiary");
    this.events.push({ type: "hire", porterId: porter.id, porterKind: porter.kind, x: porter.x, y: porter.y });
    return true;
  }

  /** Hires a premium flying porter that elves cannot intercept. */
  tryHireAirshipPorter(): boolean {
    if (!this.airshipPorterAvailable || !this.canHirePorter) return false;
    if (this.gold < SUPPLY.airshipPorterCost) return false;

    this.gold -= SUPPLY.airshipPorterCost;
    const porter = this.spawnPorter("airship");
    this.events.push({ type: "hire", porterId: porter.id, porterKind: porter.kind, x: porter.x, y: porter.y });
    return true;
  }

  /** Returns true if the tower was actually placed. */
  tryBuild(slotIndex: number, kind: TowerKind = "archer"): boolean {
    const slot = this.slots[slotIndex];
    if (!slot || slot.towerId !== null) return false;
    if (kind === "bomb" && !this.bombTowerAvailable) return false;
    const stats = TOWER_STATS[kind];
    if (this.gold < stats.cost) return false;

    this.gold -= stats.cost;
    const tower: Tower = {
      id: this.nextId++,
      kind,
      level: 1,
      slotIndex,
      x: slot.x,
      y: slot.y,
      range: stats.range,
      damage: stats.damage,
      cooldown: 0,
      fireInterval: 1 / stats.fireRate,
      facing: 0,
      targetId: null,
      // Handed a crate on completion so a new tower is useful before the first porter walks
      // out to it. Building next to nothing would otherwise be a dead 10 seconds.
      ammo: SUPPLY.crateSize,
      incendiaryAmmo: 0,
      incendiaryMagazineActive: false,
      splashRadius: kind === "bomb" ? BOMB_TOWER.splashRadius : 0,
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
      const pathIndex = entry.route ?? (this.nextSpawnIndex - 1) % this.paths.length;
      const path = this.paths[pathIndex] ?? this.path;
      const start = path.sample(0);
      const enemy: Enemy = {
        id: this.nextId++,
        kind: entry.kind,
        pathIndex,
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
        porterTargetId: null,
        attackCooldown: 0,
        attackTimer: 0,
      };
      this.enemies.push(enemy);
      this.events.push({ type: "spawn", enemyId: enemy.id });
    }
  }

  private moveEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);

      if (enemy.kind === "elf" && this.updateElfAttack(enemy, dt)) continue;

      enemy.travelled += enemy.speed * dt;

      const path = this.paths[enemy.pathIndex] ?? this.path;
      if (enemy.travelled >= path.length) {
        enemy.alive = false;
        const damage = ENEMIES[enemy.kind].leakDamage;
        this.lives = Math.max(0, this.lives - damage);
        this.events.push({ type: "leak", x: enemy.x, y: enemy.y, damage });
        continue;
      }

      const sample = path.sample(enemy.travelled);
      enemy.x = sample.x;
      enemy.y = sample.y;
      enemy.angle = sample.angle;
    }

    this.enemies = this.enemies.filter((e) => e.alive);
  }

  /** Elves stay on the lane and loose an arrow when a ground porter enters bow range. */
  private updateElfAttack(enemy: Enemy, _dt: number): boolean {
    // Elves never leave the lane. Range is deliberately a little shorter than an archer
    // tower, so placement and route timing still give ground porters occasional safe trips.
    if (enemy.attackTimer > 0) return true;
    if (enemy.attackCooldown > 0) return false;

    let target: Porter | undefined;
    let nearest: number = ELF_ATTACK.strikeRange;
    for (const porter of this.porters) {
      if (porter.kind === "airship" || porter.fleeing || porter.carrying <= 0) continue;
      const distance = dist(enemy.x, enemy.y, porter.x, porter.y);
      if (distance < nearest) {
        nearest = distance;
        target = porter;
      }
    }
    if (!target) return false;

    enemy.angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    enemy.attackCooldown = ELF_ATTACK.cooldown;
    enemy.attackTimer = ELF_ATTACK.animationTime;
    target.carrying = 0;
    target.targetTowerId = null;
    target.loading = 0;
    target.fleeing = true;
    this.events.push({
      type: "elfFire",
      x: enemy.x,
      y: enemy.y - 28,
      targetX: target.x,
      targetY: target.y - 18,
    });
    this.events.push({ type: "porterAttacked", porterId: target.id, x: target.x, y: target.y });
    return true;
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
      const ammoCost =
        tower.kind === "bomb" && tower.level === 2
          ? SUPPLY.bombAmmoPerShot
          : SUPPLY.ammoPerShot;
      if (tower.ammo < ammoCost && tower.incendiaryAmmo < ammoCost) continue;

      const incendiary = tower.incendiaryAmmo >= ammoCost;
      if (incendiary) tower.incendiaryAmmo -= ammoCost;
      else tower.ammo -= ammoCost;
      if (tower.ammo < ammoCost && tower.incendiaryAmmo < ammoCost) {
        this.events.push({ type: "dry", towerId: tower.id, x: tower.x, y: tower.y });
      }
      tower.cooldown = tower.fireInterval;
      const damage = incendiary
        ? Math.round(tower.damage * SUPPLY.incendiaryDamageMultiplier)
        : tower.damage;
      target.incoming += damage;
      const stats = towerStatsFor(tower.kind, tower.level);
      const muzzleY = tower.y - stats.muzzleHeight;
      this.projectiles.push({
        id: this.nextId++,
        kind: tower.kind,
        x: tower.x,
        y: muzzleY,
        speed: stats.projectileSpeed,
        damage,
        targetId: target.id,
        targetX: target.x,
        targetY: target.y,
        splashRadius: tower.splashRadius,
        incendiary,
        flight: 0,
        flightDistance: dist(tower.x, muzzleY, target.x, target.y),
        angle: tower.facing,
      });
      this.events.push({
        type: "fire",
        towerId: tower.id,
        towerKind: tower.kind,
        incendiary,
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

      const progress = enemy.travelled / (this.paths[enemy.pathIndex]?.length ?? this.path.length);
      const bestProgress = best
        ? best.travelled / (this.paths[best.pathIndex]?.length ?? this.path.length)
        : -1;
      if (best === null || progress > bestProgress) {
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
      if (porter.kind === "airship") {
        this.updateAirshipPorter(porter, dt);
        continue;
      }

      if (porter.fleeing) {
        if (this.stepToward(porter, this.depot.x, this.depot.y, dt)) {
          porter.fleeing = false;
          porter.loading = SUPPLY.loadTime;
        }
        continue;
      }

      if (porter.carrying > 0) {
        const tower = this.towers.find((t) => t.id === porter.targetTowerId);
        if (!tower) {
          // Destination vanished; dump the load and go back for orders.
          porter.carrying = 0;
          porter.targetTowerId = null;
          continue;
        }
        if (this.stepToward(porter, tower.x, tower.y, dt)) {
          const delivered =
            porter.kind === "incendiary"
              ? Math.min(porter.carrying, SUPPLY.incendiaryAmmoMax - tower.incendiaryAmmo)
              : Math.min(porter.carrying, SUPPLY.towerAmmoMax - tower.ammo);
          if (porter.kind === "incendiary") {
            tower.incendiaryAmmo += delivered;
            tower.incendiaryMagazineActive = true;
          } else tower.ammo += delivered;
          porter.carrying = 0;
          porter.targetTowerId = null;
          this.events.push({ type: "deliver", porterKind: porter.kind, x: tower.x, y: tower.y, amount: delivered });
        }
        continue;
      }

      if (!this.stepToward(porter, this.depot.x, this.depot.y, dt)) continue;

      if (porter.loading > 0) {
        porter.loading -= dt;
        continue;
      }

      const target =
        porter.kind === "incendiary"
          ? this.pickIncendiaryResupplyTarget()
          : this.pickResupplyTarget();
      if (!target) continue; // Nothing needs crates; wait at the depot.

      porter.carrying =
        porter.kind === "incendiary" ? SUPPLY.incendiaryCrateSize : SUPPLY.crateSize;
      porter.targetTowerId = target.id;
      porter.loading = SUPPLY.loadTime;
    }
  }

  /** Flying supply is safe but slower: every stop includes a visible descent and climb. */
  private updateAirshipPorter(porter: Porter, dt: number): void {
    const verticalStep = dt / SUPPLY.airshipVerticalTime;
    if (porter.airshipService === "loweringDepot") {
      porter.altitude = Math.max(0, porter.altitude - verticalStep);
      if (porter.altitude === 0) {
        porter.airshipService = "none";
        porter.loading = SUPPLY.loadTime;
      }
      return;
    }
    if (porter.airshipService === "raisingDepot") {
      porter.altitude = Math.min(1, porter.altitude + verticalStep);
      if (porter.altitude === 1) porter.airshipService = "none";
      return;
    }
    if (porter.airshipService === "loweringTower") {
      porter.altitude = Math.max(0, porter.altitude - verticalStep);
      if (porter.altitude === 0) {
        const tower = this.towers.find((candidate) => candidate.id === porter.targetTowerId);
        if (tower) this.deliverPorterLoad(porter, tower);
        else {
          porter.carrying = 0;
          porter.targetTowerId = null;
        }
        porter.airshipService = "raisingTower";
      }
      return;
    }
    if (porter.airshipService === "raisingTower") {
      porter.altitude = Math.min(1, porter.altitude + verticalStep);
      if (porter.altitude === 1) porter.airshipService = "none";
      return;
    }

    if (porter.carrying > 0) {
      const tower = this.towers.find((candidate) => candidate.id === porter.targetTowerId);
      if (!tower) {
        porter.carrying = 0;
        porter.targetTowerId = null;
        return;
      }
      if (this.stepToward(porter, tower.x, tower.y, dt)) {
        porter.airshipService = "loweringTower";
      }
      return;
    }

    if (!this.stepToward(porter, this.depot.x, this.depot.y, dt)) return;
    if (porter.altitude > 0) {
      porter.airshipService = "loweringDepot";
      return;
    }
    if (porter.loading > 0) {
      porter.loading = Math.max(0, porter.loading - dt);
      return;
    }

    const target = this.pickResupplyTarget();
    if (!target) return;
    porter.carrying = SUPPLY.crateSize;
    porter.targetTowerId = target.id;
    porter.airshipService = "raisingDepot";
  }

  private deliverPorterLoad(porter: Porter, tower: Tower): void {
    const delivered =
      porter.kind === "incendiary"
        ? Math.min(porter.carrying, SUPPLY.incendiaryAmmoMax - tower.incendiaryAmmo)
        : Math.min(porter.carrying, SUPPLY.towerAmmoMax - tower.ammo);
    if (porter.kind === "incendiary") {
      tower.incendiaryAmmo += delivered;
      tower.incendiaryMagazineActive = true;
    } else tower.ammo += delivered;
    porter.carrying = 0;
    porter.targetTowerId = null;
    this.events.push({ type: "deliver", porterKind: porter.kind, x: tower.x, y: tower.y, amount: delivered });
  }

  /** Moves a porter toward a point; returns true once it has arrived. */
  private stepToward(porter: Porter, x: number, y: number, dt: number): boolean {
    const dx = x - porter.x;
    const dy = y - porter.y;
    const distance = Math.hypot(dx, dy);
    const baseSpeed = porter.kind === "airship" ? SUPPLY.airshipSpeed : SUPPLY.porterSpeed;
    const travel = baseSpeed * (porter.fleeing ? SUPPLY.fleeSpeedMultiplier : 1) * dt;

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
          dist(this.depot.x, this.depot.y, tower.x, tower.y) / 4000;
        if (score < bestScore) {
          bestScore = score;
          best = tower;
        }
      }
      if (best) return best;
    }

    return null;
  }

  /** A seeded random choice keeps the special porter unpredictable but deterministic. */
  private pickIncendiaryResupplyTarget(): Tower | null {
    const claimed = new Set(
      this.porters
        .filter((porter) => porter.kind === "incendiary")
        .map((porter) => porter.targetTowerId)
        .filter((id): id is number => id !== null),
    );
    let candidates = this.towers.filter(
      (tower) => tower.incendiaryAmmo < SUPPLY.incendiaryAmmoMax && !claimed.has(tower.id),
    );
    if (candidates.length === 0) {
      candidates = this.towers.filter(
        (tower) => tower.incendiaryAmmo < SUPPLY.incendiaryAmmoMax,
      );
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(this.nextRandom() * candidates.length)] ?? null;
  }

  private nextRandom(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x1_0000_0000;
  }

  private moveProjectiles(dt: number): void {
    const survivors: Projectile[] = [];

    for (const projectile of this.projectiles) {
      const target = this.enemies.find((e) => e.id === projectile.targetId && e.alive);
      if (target) {
        projectile.targetX = target.x;
        projectile.targetY = target.y;
      } else if (projectile.kind === "archer") {
        continue; // Target already died; the arrow is spent.
      }

      const dx = projectile.targetX - projectile.x;
      const dy = projectile.targetY - projectile.y;
      const distance = Math.hypot(dx, dy);
      const travel = projectile.speed * dt;
      projectile.angle = Math.atan2(dy, dx);

      if (distance <= travel + (target?.radius ?? 8)) {
        if (projectile.kind === "bomb") {
          this.events.push({
            type: "explode",
            x: projectile.targetX,
            y: projectile.targetY,
            radius: projectile.splashRadius,
          });
          for (const enemy of [...this.enemies]) {
            if (!enemy.alive) continue;
            if (dist(enemy.x, enemy.y, projectile.targetX, projectile.targetY) <= projectile.splashRadius) {
              this.applyDamage(enemy, projectile.damage, "bomb", projectile.incendiary);
            }
          }
        } else if (target) {
          this.applyDamage(target, projectile.damage, "archer", projectile.incendiary);
        }
        continue;
      }

      projectile.x += (dx / distance) * travel;
      projectile.y += (dy / distance) * travel;
      projectile.flight += travel;
      survivors.push(projectile);
    }

    this.projectiles = survivors;
  }

  private applyDamage(enemy: Enemy, damage: number, towerKind: TowerKind, incendiary: boolean): void {
    enemy.incoming = Math.max(0, enemy.incoming - damage);
    enemy.hp -= damage;
    this.events.push({ type: "hit", towerKind, incendiary, x: enemy.x, y: enemy.y, damage });

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
