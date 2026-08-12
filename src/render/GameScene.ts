import Phaser from "phaser";
import { BOMB_TOWER, ELF_ATTACK, SUPPLY, TOWER, TOWER_UPGRADES, VIEW } from "../sim/config";
import type { EnemyKind } from "../sim/config";
import type { GameEvent } from "../sim/types";
import { World } from "../sim/world";
import { LEVEL_COUNT, markLevelCompleted, markLevelStarted } from "../save";
import { generateAllTextures } from "./art";
import { C, hex } from "./palette";

/**
 * Hand-made art, keyed by the procedural texture it replaces.
 *
 * Anything listed here wins over the drawing of the same name, so real art can arrive one
 * sprite at a time without touching `art.ts` — drop the PNG in `public/sprites/` and add a
 * line. Paths are relative to `public/`.
 */
const REAL_ART: Record<string, string> = {
  "terrain-1": "sprites/map-gate-preview.png",
  "terrain-2": "sprites/map-level-2.png",
  "terrain-3": "sprites/map-level-3.png",
  "terrain-4": "sprites/map-level-4-v8.png",
  "terrain-5": "sprites/map-level-5.png",
  "bomb-tower": "sprites/bomb-tower.png",
  "bomb-tower-2": "sprites/bomb-tower-2.png",
  bomb: "sprites/bomb.png",
  "ui-icon-archer": "sprites/ui-icon-archer.png",
  "ui-icon-bomb": "sprites/ui-icon-bomb.png",
  "ui-icon-porter": "sprites/ui-icon-porter.png",
  "ui-icon-fire-porter": "sprites/ui-icon-fire-porter.png",
  "fire-ammo-crate": "sprites/fire-ammo-crate.png",
  "ui-icon-sell": "sprites/ui-icon-sell.png",
  "goblin-airship": "sprites/goblin-airship.png",
};

const SOUND_EFFECTS = {
  arrowFlight: { key: "sfx-arrow-flight", url: "audio/arrow-flight.mp3" },
  arrowHit: { key: "sfx-arrow-hit", url: "audio/arrow-hit.mp3" },
  build: { key: "sfx-build-tower", url: "audio/build-tower.mp3" },
  uiClick: { key: "sfx-ui-click", url: "audio/ui-click.mp3" },
  hire: [
    { key: "sfx-hire-goblin-1", url: "audio/hire-goblin-1.mp3" },
    { key: "sfx-hire-goblin-2", url: "audio/hire-goblin-2.mp3" },
    { key: "sfx-hire-goblin-3", url: "audio/hire-goblin-3.mp3" },
    { key: "sfx-hire-goblin-4", url: "audio/hire-goblin-4.mp3" },
    { key: "sfx-hire-goblin-5", url: "audio/hire-goblin-5.mp3" },
  ],
  sell: { key: "sfx-sell-tower", url: "audio/sell-tower.mp3" },
} as const;

const DEPOT_DISPLAY_HEIGHT = 130;

/**
 * Depot gate frames, in order of how open they are.
 *
 * The gate reacts to porters rather than running on a loop: it swings wide when one is at the
 * door and shuts once they have all walked off. That ties the animation to something that is
 * actually happening instead of decorating the building with idle motion.
 */
const DEPOT_GATE = { shut: 0, ajar: 2, open: 1 } as const;

/** Only this source rectangle changes between the AI-drawn depot frames. */
const DEPOT_GATE_CROP = { x: 25, y: 145, width: 88, height: 105 } as const;

/** One segment per hired porter, positioned just below the depot. */
const DEPOT_PORTER_PIP = { width: 8, height: 7, gap: 2, y: 47 } as const;

/** A returning, empty porter crosses this threshold and is considered inside the depot. */
const DEPOT_INTERIOR_RADIUS = 24;

/**
 * Enemies with a hand-drawn walk cycle, as the prefix of their atlas keys.
 *
 * Each one supplies three atlases — `-side`, `-face`, `-back` — built by `import-strip.ps1`
 * from a single generated strip per direction. Having three views matters here because the
 * lane has long vertical stretches; a side view alone would spend a third of the map walking
 * sideways down the road.
 */
const WALK_ATLASES: Partial<Record<EnemyKind, string>> = {
  peasant: "peasant",
  grunt: "grunt",
  elf: "elf",
};

/**
 * The porter's own walk atlas.
 *
 * Kept separate from `WALK_ATLASES` because that map is keyed by `EnemyKind` and a porter is
 * not an enemy. The crate is drawn onto the sprite itself, so the loose crate that used to
 * be pinned above a loaded porter is gone — it would now be a second crate.
 */
const PORTER_ATLAS = "goblin";
const PORTER_FLEE_ATLAS = "goblin-flee";
const PORTER_DISPLAY_HEIGHT = 56;
const AIRSHIP_DISPLAY_HEIGHT = 104;

const TOWER_DISPLAY_HEIGHT = 96;

/**
 * Frame index on the tower sheet for a heading.
 *
 * All six directions are drawn out, and none of them is mirrored. Mirroring used to halve the
 * artwork, but flipping the sprite flips the *whole* tower — ladder, banner, legs — so the
 * building itself snapped left and right as the archer tracked a target. Six drawn frames
 * keep the structure still and rotate only the goblin.
 *
 * The sheet runs [left-up, left, left-down, right-up, right, right-down]. Angles below are in
 * the artist's convention: 0 straight up, growing clockwise. Phaser measures from +x with +y
 * downward, hence the +90 shift.
 */
function towerAimFrame(facing: number): number {
  const deg = ((facing * 180) / Math.PI + 90 + 360) % 360;
  if (deg < 60) return 3; // right-up
  if (deg < 120) return 4; // right
  if (deg < 180) return 5; // right-down
  if (deg < 240) return 2; // left-down
  if (deg < 300) return 1; // left
  return 0; // left-up
}

/** Segmented ammo gauge under each tower: one notch per shot left. */
// Sized so a full magazine's worth of notches stays about as wide as the tower itself; at
// 18 rounds a generous pip turns the gauge into a strip wider than the building.
const AMMO_PIP = { width: 3, height: 7, gap: 1.2, y: 18 } as const;
const FIRE_AMMO_PIP = { width: 5, height: 5, gap: 1.5, y: 29 } as const;

/**
 * Towers, enemies and porters share one depth band and sort by how far down the screen they
 * are, so a unit walking behind a tower passes behind it. Flat per-type depths were fine
 * while the tower was a stubby 80px block; at 96px tall it overlaps the road.
 */
function groundDepth(y: number): number {
  return DEPTH.ground + y * 0.01;
}

/** Frame counts differ per sheet, so each atlas is asked how many it actually has. */
function frameCount(scene: Phaser.Scene, atlasKey: string): number {
  return scene.textures.get(atlasKey).getFrameNames().length;
}

/** Which of the three drawn views to show for a heading. */
function walkView(angle: number): "side" | "face" | "back" {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // Screen y grows downward, so a positive dy is movement toward the viewer.
  if (Math.abs(dy) > Math.abs(dx)) return dy > 0 ? "face" : "back";
  return "side";
}

/**
 * On-screen height of each enemy in pixels, independent of its source resolution.
 *
 * Scale used to be a fixed 1.25×, which only worked while every sprite was generated at a
 * known size. Hand-drawn art arrives at whatever resolution the artist worked at — the grunt
 * is an 80px PNG next to a 56px generated brute — so the scale is derived from the texture
 * instead. A 2× redraw of any of these then needs no code change at all.
 */
const ENEMY_DISPLAY_HEIGHT: Record<EnemyKind, number> = {
  peasant: 52,
  grunt: 64,
  elf: 62,
};

/**
 * How far below its position on the lane a unit's feet land.
 *
 * This works out to one number for every unit, at any size, because `import-sprite.ps1`
 * crops each sprite tight — so the feet are always the bottom row of the texture and sit
 * exactly half the display height below the centre. It used to be a hand-tuned value per
 * enemy, which only looked right until a sprite arrived with different padding.
 */
const FOOT_BELOW_CENTRE = 2;

/**
 * Distance covered per full stride, as a fraction of the unit's on-screen height.
 *
 * The walk is driven by distance travelled rather than by a timer, which is what makes it
 * hold together: a quick grunt takes quick steps and a heavy brute plods, straight out of
 * their speeds, with no per-enemy tuning. It also means two units never march in lockstep,
 * because their phase comes from where they are on the road.
 */
const STRIDE_FACTOR = 0.55;

/**
 * Turns distance walked into the pose of a single static sprite.
 *
 * Four motions on one phase. `lift` peaks twice per stride, once per footfall, and `impact`
 * is its inverse — the moment weight lands. Squash on impact is what sells it; bob alone
 * reads as floating.
 */
function walkPose(distance: number, stride: number) {
  const phase = (distance / stride) * Math.PI * 2;
  const lift = Math.abs(Math.sin(phase));
  const impact = 1 - lift;

  return {
    lift: -lift * 2.6,
    sway: Math.cos(phase) * 1.1,
    lean: Math.sin(phase) * 0.05,
    // Widen as it squashes, so the unit keeps roughly its volume.
    squashX: 1 + impact * 0.05,
    squashY: 1 - impact * 0.06,
  };
}

const DEPTH = {
  terrain: 0,
  pad: 5,
  keep: 10,
  /** Shared band for anything standing on the ground; y decides what overlaps what. */
  ground: 20,
  projectile: 30,
  effect: 40,
  ui: 50,
} as const;

interface EnemyView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  hpBackground: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  /** Scale that fits the texture to its display height; squash multiplies this. */
  baseScale: number;
}

interface TowerView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  /** One rectangle per round the magazine holds; filled ones show what is left. */
  pips: Phaser.GameObjects.Rectangle[];
  firePips: Phaser.GameObjects.Rectangle[];
  /** Pulsing crossed-arrow badge shown while both magazines are empty. */
  dryBadge: Phaser.GameObjects.Container;
}

interface PorterView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  fireCargo: Phaser.GameObjects.Image;
  baseScale: number;
  /** Ground covered so far, so the walk can be driven by distance like the enemies. */
  walked: number;
  lastX: number;
  lastY: number;
}


/**
 * Draws the world and turns taps into build commands. It reads simulation state but never
 * mutates it except through `World`'s public methods — all game rules live in `src/sim`.
 */
export class GameScene extends Phaser.Scene {
  world!: World;

  private saveSlot = 0;
  private level = 1;
  private completionRecorded = false;

  private enemyViews = new Map<number, EnemyView>();
  private towerViews = new Map<number, TowerView>();
  private projectileViews = new Map<number, Phaser.GameObjects.Image>();
  private porterViews = new Map<number, PorterView>();
  private padZones: Phaser.GameObjects.Zone[] = [];

  private buildMenu!: Phaser.GameObjects.Container;
  private rangePreview!: Phaser.GameObjects.Arc;
  /** Which purchase the popup is currently offering, if any. */
  private menuKind: "tower" | "porter" | "manage" | "sell" | null = null;
  private menuSlotIndex: number | null = null;
  /** Stable open-building frame; never changes while the gate animates. */
  private depotSprite!: Phaser.GameObjects.Image;
  /** Cropped overlay containing only the moving gate. */
  private depotGateSprite!: Phaser.GameObjects.Image;
  private depotPorterPips: Phaser.GameObjects.Rectangle[] = [];
  private menuCostText!: Phaser.GameObjects.Text;
  private menuActionText!: Phaser.GameObjects.Text;
  private menuButton!: Phaser.GameObjects.Arc;
  private menuIcon!: Phaser.GameObjects.Image;
  private menuIconBacking!: Phaser.GameObjects.Arc;
  private bombMenuButton!: Phaser.GameObjects.Arc;
  private bombMenuIcon!: Phaser.GameObjects.Image;
  private bombMenuIconBacking!: Phaser.GameObjects.Arc;
  private bombMenuCostText!: Phaser.GameObjects.Text;
  private bombMenuActionText!: Phaser.GameObjects.Text;
  private airshipMenuButton!: Phaser.GameObjects.Arc;
  private airshipMenuIcon!: Phaser.GameObjects.Image;
  private airshipMenuIconBacking!: Phaser.GameObjects.Arc;
  private airshipMenuCostText!: Phaser.GameObjects.Text;
  /** Prevents several towers firing on the same simulation tick from clipping loudly. */
  private lastSoundAt = new Map<string, number>();
  private lastGoblinPhrase = -1;

  constructor() {
    super("Game");
  }

  init(data?: { saveSlot?: number; level?: number }): void {
    this.saveSlot = data?.saveSlot ?? this.saveSlot;
    this.level = data?.level ?? this.level;
    this.completionRecorded = false;
  }

  /** Queue the hand-made art. Procedural drawing fills the gaps afterwards, in `create()`. */
  preload(): void {
    for (const [key, url] of Object.entries(REAL_ART)) {
      if (!this.textures.exists(key)) this.load.image(key, url);
    }
    const atlasKeys = [
      ...[...Object.values(WALK_ATLASES), PORTER_ATLAS, PORTER_FLEE_ATLAS].flatMap((prefix) =>
        ["side", "face", "back"].map((view) => `${prefix}-${view}`),
      ),
      "elf-attack",
      // Single-row atlases: six tower aim frames, three depot gate states.
      "tower",
      "tower-2",
      "depot",
    ];
    for (const key of atlasKeys) {
      if (!this.textures.exists(key)) {
        this.load.atlas(key, `sprites/${key}.png`, `sprites/${key}.json`);
      }
    }
    const soundAssets = Object.values(SOUND_EFFECTS).flatMap((effect) =>
      Array.isArray(effect) ? effect : [effect],
    );
    for (const effect of soundAssets) {
      if (!this.cache.audio.exists(effect.key)) this.load.audio(effect.key, effect.url);
    }
  }

  create(): void {
    // Procedural textures cover whatever real art has not replaced yet.
    //
    // This has to happen in create(), not preload(): the loader only finishes between the
    // two, so checking `textures.exists` any earlier would not see the PNGs and the drawn
    // version would overwrite them. `spark` is the "already generated" sentinel — it has to
    // be a key that is always procedural, which `terrain` no longer is now that the map is
    // painted, and restart() re-runs both hooks.
    if (!this.textures.exists("spark")) {
      for (const { key, canvas } of generateAllTextures()) {
        if (!this.textures.exists(key)) this.textures.addCanvas(key, canvas);
      }
    }

    // restart() reuses this Scene instance, so the view maps still hold the previous run's
    // (now destroyed) objects. Clear them before rebuilding.
    this.enemyViews.clear();
    this.towerViews.clear();
    this.projectileViews.clear();
    this.porterViews.clear();
    this.padZones = [];
    this.depotPorterPips = [];
    this.menuSlotIndex = null;
    this.menuKind = null;
    this.lastSoundAt.clear();
    this.lastGoblinPhrase = -1;

    this.world = new World(this.level);

    this.add.image(0, 0, this.world.terrainKey).setOrigin(0, 0).setDepth(DEPTH.terrain);

    // The depot doubles as the hire button — tapping the building you get porters from is
    // more discoverable than a HUD control tucked away in a corner.
    const depot = this.world.depot;
    const depotBottom = depot.y + 30;
    this.depotSprite = this.add
      .image(depot.x, depotBottom, "depot", `walk_${DEPOT_GATE.open}`)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.keep);
    this.depotSprite.setScale(DEPOT_DISPLAY_HEIGHT / this.depotSprite.height);
    this.depotSprite
      .setInteractive()
      .on("pointerdown", () => this.openPorterMenu());

    // The three AI frames redraw the entire building slightly differently. Switching the
    // full image made roofs, towers and the crane jump. Keep the open frame as a permanent
    // base and overlay only the small gate area for the shut and ajar states.
    this.depotGateSprite = this.add
      .image(depot.x, depotBottom, "depot", `walk_${DEPOT_GATE.shut}`)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.keep + 0.01)
      .setScale(DEPOT_DISPLAY_HEIGHT / this.depotSprite.height)
      .setCrop(
        DEPOT_GATE_CROP.x,
        DEPOT_GATE_CROP.y,
        DEPOT_GATE_CROP.width,
        DEPOT_GATE_CROP.height,
      );

    const porterCapacity = SUPPLY.maxPorters;
    const porterSpan =
      porterCapacity * DEPOT_PORTER_PIP.width +
      (porterCapacity - 1) * DEPOT_PORTER_PIP.gap;
    for (let i = 0; i < porterCapacity; i++) {
      this.depotPorterPips.push(
        this.add
          .rectangle(
            depot.x - porterSpan / 2 + i * (DEPOT_PORTER_PIP.width + DEPOT_PORTER_PIP.gap),
            depot.y + DEPOT_PORTER_PIP.y,
            DEPOT_PORTER_PIP.width,
            DEPOT_PORTER_PIP.height,
            hex(C.accent),
          )
          .setOrigin(0, 0.5)
          .setStrokeStyle(1, hex(C.outline))
          .setDepth(DEPTH.keep + 0.02),
      );
    }

    this.createPads();
    this.createBuildMenu();

    // Tapping empty ground dismisses the build menu.
    this.input.on("pointerdown", (_p: Phaser.Input.Pointer, targets: unknown[]) => {
      if (targets.length === 0) this.closeBuildMenu();
    });

    // Only the first scene in the game config auto-starts, so bring the HUD up here.
    // `launch` runs it in parallel rather than replacing this scene.
    if (!this.scene.isActive("Hud")) {
      this.scene.launch("Hud");
    }
  }

  restart(): void {
    this.scene.restart({ saveSlot: this.saveSlot, level: this.level });
  }

  get hasNextLevel(): boolean {
    return this.level < LEVEL_COUNT;
  }

  startNextLevel(): void {
    if (!this.hasNextLevel) return;
    const nextLevel = this.level + 1;
    markLevelStarted(this.saveSlot, nextLevel);
    this.scene.restart({ saveSlot: this.saveSlot, level: nextLevel });
  }

  recordVictory(): void {
    if (this.completionRecorded) return;
    this.completionRecorded = true;
    markLevelCompleted(this.saveSlot, this.level);
  }

  override update(_time: number, delta: number): void {
    this.world.update(delta / 1000);
    this.drainEvents();
    this.syncEnemies();
    this.syncTowers();
    this.syncPorters();
    this.syncProjectiles();
    this.refreshPads();
  }

  // ------------------------------------------------------------- construction

  /**
   * Invisible hit zones over the painted clearings.
   *
   * There is no pad sprite any more. The map itself shows where towers go, and stamping a
   * drawn dirt patch with a signpost on top of a painted one just doubled the ground up.
   * What is still needed is somewhere to tap, hence a zone rather than an image.
   */
  private createPads(): void {
    for (const slot of this.world.slots) {
      const zone = this.add
        .zone(slot.x, slot.y, 96, 96)
        // Generous and round: thumbs are far less precise than a mouse.
        .setInteractive(new Phaser.Geom.Circle(48, 48, 48), Phaser.Geom.Circle.Contains)
        .setDepth(DEPTH.pad);

      // No stopPropagation here: `pointer.event` is not always populated, and reaching into
      // it throws. The scene-level handler already ignores taps that landed on an object.
      zone.on("pointerdown", () => this.openBuildMenu(slot.index));

      this.padZones.push(zone);
    }
  }

  private createBuildMenu(): void {
    this.rangePreview = this.add
      .circle(0, 0, TOWER.range, hex(C.accent), 0.14)
      .setStrokeStyle(3, hex(C.accent), 0.75)
      .setDepth(DEPTH.ui)
      .setVisible(false);

    this.menuButton = this.add
      .circle(0, 0, 34, hex(C.panel), 0.96)
      .setStrokeStyle(4, hex(C.gold))
      .setInteractive({ useHandCursor: true });

    // Light disc behind the icon keeps the chunky weapon silhouette readable on grass.
    this.menuIconBacking = this.add.circle(0, 0, 25, hex(C.stoneLight), 1);
    this.menuIcon = this.add.image(0, 0, "ui-icon-archer");
    this.fitMenuIcon();

    // Sits just outside the disc so it never overlaps the icon, with a heavy outline so it
    // stays legible against grass.
    this.menuCostText = this.add
      .text(0, 40, `${TOWER.cost}`, {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "22px",
        color: C.gold,
        stroke: C.outline,
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    this.menuActionText = this.add
      .text(0, -44, "", {
        fontFamily: "'Arial Black', Arial, sans-serif",
        fontSize: "12px",
        color: C.parchment,
        stroke: C.outline,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.bombMenuButton = this.add
      .circle(45, 0, 34, hex(C.panel), 0.96)
      .setStrokeStyle(4, hex(C.gold))
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.bombMenuIconBacking = this.add
      .circle(45, 0, 25, hex(C.stoneLight), 1)
      .setVisible(false);
    this.bombMenuIcon = this.add.image(45, 0, "ui-icon-bomb").setVisible(false);
    this.bombMenuIcon.setScale(48 / Math.max(this.bombMenuIcon.width, this.bombMenuIcon.height));
    this.bombMenuCostText = this.add
      .text(45, 40, `${BOMB_TOWER.cost}`, {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "22px",
        color: C.gold,
        stroke: C.outline,
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.bombMenuActionText = this.add
      .text(45, -44, "", {
        fontFamily: "'Arial Black', Arial, sans-serif",
        fontSize: "12px",
        color: C.parchment,
        stroke: C.outline,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.airshipMenuButton = this.add
      .circle(90, 0, 34, hex(C.panel), 0.96)
      .setStrokeStyle(4, hex(C.gold))
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.airshipMenuIconBacking = this.add.circle(90, 0, 25, hex(C.stoneLight), 1).setVisible(false);
    this.airshipMenuIcon = this.add.image(90, 0, "goblin-airship").setVisible(false);
    this.airshipMenuIcon.setScale(50 / Math.max(this.airshipMenuIcon.width, this.airshipMenuIcon.height));
    this.airshipMenuCostText = this.add
      .text(90, 40, `${SUPPLY.airshipPorterCost}`, {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "22px",
        color: C.gold,
        stroke: C.outline,
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.buildMenu = this.add
      .container(0, 0, [
        this.menuButton,
        this.menuIconBacking,
        this.menuIcon,
        this.menuCostText,
        this.menuActionText,
        this.bombMenuButton,
        this.bombMenuIconBacking,
        this.bombMenuIcon,
        this.bombMenuCostText,
        this.bombMenuActionText,
        this.airshipMenuButton,
        this.airshipMenuIconBacking,
        this.airshipMenuIcon,
        this.airshipMenuCostText,
      ])
      .setDepth(DEPTH.ui)
      .setVisible(false);

    // Hovering the icon shows what the tower would cover. The circle is also shown outright
    // when the popup opens, since a touch screen never sends a hover.
    this.menuButton.on("pointerover", () => {
      if (this.menuKind === "tower" || this.menuKind === "manage" || this.menuKind === "sell") {
        this.rangePreview.setVisible(true);
      }
    });
    this.menuButton.on("pointerout", () => {
      if (this.menuKind === "porter") this.rangePreview.setVisible(false);
    });

    this.bombMenuButton.on("pointerover", () => {
      if (this.menuKind === "tower") {
        this.rangePreview.setRadius(BOMB_TOWER.range).setVisible(true);
      } else if (this.menuKind === "manage" && this.menuSlotIndex !== null) {
        const slot = this.world.slots[this.menuSlotIndex];
        const tower = this.world.towers.find((candidate) => candidate.id === slot?.towerId);
        if (tower) this.rangePreview.setRadius(tower.range).setVisible(true);
      }
    });
    this.bombMenuButton.on("pointerout", () => {
      if (this.menuKind === "tower") this.rangePreview.setRadius(TOWER.range);
      else if (this.menuKind === "manage" && this.menuSlotIndex !== null) {
        const slot = this.world.slots[this.menuSlotIndex];
        const tower = this.world.towers.find((candidate) => candidate.id === slot?.towerId);
        if (tower) this.rangePreview.setRadius(TOWER_UPGRADES[tower.kind].range);
      }
    });
    this.bombMenuButton.on("pointerdown", () => {
      if (this.menuKind === null) return;
      this.playEffect(SOUND_EFFECTS.uiClick.key, 0.24);
      const bought =
        this.menuKind === "porter"
          ? this.world.tryHireIncendiaryPorter()
          : this.menuKind === "manage" && this.menuSlotIndex !== null
            ? this.world.trySell(this.menuSlotIndex)
          : this.menuKind === "tower" && this.menuSlotIndex !== null
            ? this.world.tryBuild(this.menuSlotIndex, "bomb")
            : false;
      if (bought) {
        this.closeBuildMenu();
        return;
      }
      this.shakeBuildMenu();
    });

    this.airshipMenuButton.on("pointerdown", () => {
      if (this.menuKind !== "porter") return;
      this.playEffect(SOUND_EFFECTS.uiClick.key, 0.24);
      if (this.world.tryHireAirshipPorter()) this.closeBuildMenu();
      else this.shakeBuildMenu();
    });

    this.menuButton.on("pointerdown", () => {
      if (this.menuKind === null) return;
      this.playEffect(SOUND_EFFECTS.uiClick.key, 0.24);

      const bought =
        this.menuKind === "porter"
          ? this.world.tryHirePorter()
          : this.menuKind === "sell"
            ? this.menuSlotIndex !== null && this.world.trySell(this.menuSlotIndex)
            : this.menuKind === "manage"
              ? this.menuSlotIndex !== null && this.world.tryUpgrade(this.menuSlotIndex)
              : this.menuSlotIndex !== null && this.world.tryBuild(this.menuSlotIndex);

      if (bought) {
        this.closeBuildMenu();
        return;
      }

      // Can't afford it: shake the button rather than silently doing nothing. Anchor the
      // shake to the popup's home x, not its current one, so repeated taps can't walk it away.
      this.shakeBuildMenu();
    });
  }

  private shakeBuildMenu(): void {
    const homeX =
      this.menuKind === "porter" ? this.world.depot.x : this.world.slots[this.menuSlotIndex!]!.x;
    this.tweens.killTweensOf(this.buildMenu);
    this.buildMenu.setX(homeX);
    this.tweens.add({
      targets: this.buildMenu,
      x: homeX + 6,
      duration: 55,
      yoyo: true,
      repeat: 3,
      onComplete: () => this.buildMenu.setX(homeX),
    });
  }

  /** Fits painted popup art inside the backing disc without stretching its proportions. */
  private fitMenuIcon(): void {
    this.menuIcon.setScale(1);
    this.menuIcon.setScale(48 / Math.max(this.menuIcon.width, this.menuIcon.height));
  }

  private openPorterMenu(): void {
    if (this.world.status !== "playing") return;
    if (!this.world.canHirePorter) return; // At the cap; nothing to offer.

    this.menuKind = "porter";
    this.setManageLabels(false);
    this.setBombChoiceVisible(this.world.incendiaryPorterAvailable, this.world.airshipPorterAvailable);
    this.menuSlotIndex = null;
    this.menuIcon.setTexture("ui-icon-porter");
    this.fitMenuIcon();
    this.menuCostText.setText(`${SUPPLY.porterCost}`);
    this.bombMenuIcon.setTexture("ui-icon-fire-porter");
    this.bombMenuIcon.setScale(48 / Math.max(this.bombMenuIcon.width, this.bombMenuIcon.height));
    this.bombMenuCostText.setText(`${SUPPLY.incendiaryPorterCost}`);
    this.airshipMenuIcon.setTexture("goblin-airship");
    this.airshipMenuIcon.setScale(50 / Math.max(this.airshipMenuIcon.width, this.airshipMenuIcon.height));
    this.airshipMenuCostText.setText(`${SUPPLY.airshipPorterCost}`);
    this.showMenuAt(this.world.depot.x, this.world.depot.y - 40);
    this.rangePreview.setVisible(false);
  }

  /** Tapping a pad that already has a tower offers to dismantle it instead. */
  private openSellMenu(slotIndex: number): void {
    const slot = this.world.slots[slotIndex];
    if (!slot || slot.towerId === null || this.world.status !== "playing") return;

    this.menuKind = "sell";
    this.setManageLabels(true, false);
    this.setBombChoiceVisible(false);
    this.menuSlotIndex = slotIndex;
    this.menuIcon.setTexture("ui-icon-sell");
    this.fitMenuIcon();
    this.menuCostText.setText(`+${this.world.sellValueFor(slotIndex)}`);
    this.showMenuAt(slot.x, slot.y);
    this.rangePreview.setPosition(slot.x, slot.y).setVisible(true);
  }

  /** Level 5 adds a two-action popup: improve the tower or dismantle it. */
  private openManageMenu(slotIndex: number): void {
    const slot = this.world.slots[slotIndex];
    const tower = this.world.towers.find((candidate) => candidate.id === slot?.towerId);
    if (!slot || !tower || tower.level === 2 || !this.world.towerUpgradesAvailable) {
      this.openSellMenu(slotIndex);
      return;
    }

    this.menuKind = "manage";
    this.setManageLabels(true, true);
    this.menuSlotIndex = slotIndex;
    this.menuIcon.setTexture(tower.kind === "archer" ? "tower-2" : "bomb-tower-2", tower.kind === "archer" ? "walk_4" : undefined);
    this.fitMenuIcon();
    this.menuCostText.setText(`${this.world.upgradeCostFor(slotIndex)}`);
    this.bombMenuIcon.setTexture("ui-icon-sell");
    this.bombMenuIcon.setScale(48 / Math.max(this.bombMenuIcon.width, this.bombMenuIcon.height));
    this.bombMenuCostText.setText(`+${this.world.sellValueFor(slotIndex)}`);
    this.setBombChoiceVisible(true);
    this.showMenuAt(slot.x, slot.y);
    this.rangePreview
      .setPosition(slot.x, slot.y)
      .setRadius(TOWER_UPGRADES[tower.kind].range)
      .setVisible(true);
  }

  private openBuildMenu(slotIndex: number): void {
    const slot = this.world.slots[slotIndex];
    if (this.world.status !== "playing") return;
    // Occupied pads sell rather than doing nothing.
    if (slot && slot.towerId !== null) return this.openManageMenu(slotIndex);
    if (!slot) return;

    this.menuKind = "tower";
    this.setManageLabels(false);
    this.menuSlotIndex = slotIndex;
    this.menuIcon.setTexture("ui-icon-archer");
    this.fitMenuIcon();
    this.menuCostText.setText(`${TOWER.cost}`);
    this.bombMenuIcon.setTexture("ui-icon-bomb");
    this.bombMenuIcon.setScale(48 / Math.max(this.bombMenuIcon.width, this.bombMenuIcon.height));
    this.bombMenuCostText.setText(`${BOMB_TOWER.cost}`);
    this.setBombChoiceVisible(this.world.bombTowerAvailable);

    this.showMenuAt(slot.x, slot.y);
    this.rangePreview.setPosition(slot.x, slot.y).setRadius(TOWER.range).setVisible(true);
  }

  private setBombChoiceVisible(visible: boolean, airshipVisible = false): void {
    const archerX = airshipVisible ? -90 : visible ? -45 : 0;
    this.menuButton.setX(archerX);
    this.menuIconBacking.setX(archerX);
    this.menuIcon.setX(archerX);
    this.menuCostText.setX(archerX);
    this.menuActionText.setX(archerX);
    const secondX = airshipVisible ? 0 : 45;
    this.bombMenuButton.setX(secondX).setVisible(visible);
    this.bombMenuIconBacking.setX(secondX).setVisible(visible);
    this.bombMenuIcon.setX(secondX).setVisible(visible);
    this.bombMenuCostText.setX(secondX).setVisible(visible);
    this.bombMenuActionText.setX(secondX).setVisible(visible && this.menuKind === "manage");
    this.airshipMenuButton.setVisible(airshipVisible);
    this.airshipMenuIconBacking.setVisible(airshipVisible);
    this.airshipMenuIcon.setVisible(airshipVisible);
    this.airshipMenuCostText.setVisible(airshipVisible);
  }

  private setManageLabels(primaryVisible: boolean, secondaryVisible = false): void {
    this.menuActionText.setText(primaryVisible && secondaryVisible ? "UPGRADE" : "SELL");
    this.menuActionText.setVisible(primaryVisible);
    this.bombMenuActionText.setText("SELL").setVisible(secondaryVisible);
  }

  // Affordability is no longer passed in: it is re-evaluated every frame instead.
  private showMenuAt(x: number, y: number): void {
    // Kill leftover tweens first. The open animation and the can't-afford shake both drive
    // the menu's x/scale toward absolute targets captured when they were created, so one
    // still running from a previous pad drags the popup back to that pad's position and
    // holds it mid-scale.
    this.tweens.killTweensOf(this.buildMenu);

    // Keep the popup on screen when the anchor sits near the top edge.
    const above = y > 130;
    this.buildMenu.setPosition(x, y + (above ? -78 : 78)).setVisible(true);
    this.buildMenu.setScale(0.5);
    this.tweens.add({
      targets: this.buildMenu,
      scale: 1,
      duration: 160,
      ease: "Back.easeOut",
    });

    this.refreshMenuAffordability();
  }

  /**
   * Re-styles the open popup for what the player can currently afford.
   *
   * Called every frame, not just on open. Priced once at open time, a popup left up while a
   * kill paid out stayed greyed and unbuyable-looking even though the gold had arrived.
   */
  private refreshMenuAffordability(): void {
    if (this.menuKind === null) return;

    // Selling always goes ahead: it pays out rather than charging.
    const primaryCost =
      this.menuKind === "porter"
        ? SUPPLY.porterCost
        : this.menuKind === "manage" && this.menuSlotIndex !== null
          ? this.world.upgradeCostFor(this.menuSlotIndex)
          : TOWER.cost;
    const affordable = this.menuKind === "sell" || this.world.canAfford(primaryCost);

    this.menuButton.setStrokeStyle(4, affordable ? hex(C.gold) : hex(C.stoneDark));
    this.menuIconBacking.setFillStyle(hex(affordable ? C.stoneLight : C.stoneDark));
    this.menuIcon.setAlpha(affordable ? 1 : 0.45);
    this.menuCostText.setColor(affordable ? C.gold : C.hpBad);

    if (this.menuKind === "tower" && this.world.bombTowerAvailable) {
      const bombAffordable = this.world.canAfford(BOMB_TOWER.cost);
      this.bombMenuButton.setStrokeStyle(4, bombAffordable ? hex(C.gold) : hex(C.stoneDark));
      this.bombMenuIconBacking.setFillStyle(hex(bombAffordable ? C.stoneLight : C.stoneDark));
      this.bombMenuIcon.setAlpha(bombAffordable ? 1 : 0.45);
      this.bombMenuCostText.setColor(bombAffordable ? C.gold : C.hpBad);
    }
    if (this.menuKind === "manage") {
      this.bombMenuButton.setStrokeStyle(4, hex(C.gold));
      this.bombMenuIconBacking.setFillStyle(hex(C.stoneLight));
      this.bombMenuIcon.setAlpha(1);
      this.bombMenuCostText.setColor(C.gold);
    }
    if (this.menuKind === "porter" && this.world.incendiaryPorterAvailable) {
      const fireAffordable = this.world.canAfford(SUPPLY.incendiaryPorterCost);
      this.bombMenuButton.setStrokeStyle(4, fireAffordable ? hex(C.gold) : hex(C.stoneDark));
      this.bombMenuIconBacking.setFillStyle(hex(fireAffordable ? C.stoneLight : C.stoneDark));
      this.bombMenuIcon.setAlpha(fireAffordable ? 1 : 0.45);
      this.bombMenuCostText.setColor(fireAffordable ? C.gold : C.hpBad);
    }
    if (this.menuKind === "porter" && this.world.airshipPorterAvailable) {
      const airshipAffordable = this.world.canAfford(SUPPLY.airshipPorterCost);
      this.airshipMenuButton.setStrokeStyle(4, airshipAffordable ? hex(C.gold) : hex(C.stoneDark));
      this.airshipMenuIconBacking.setFillStyle(hex(airshipAffordable ? C.stoneLight : C.stoneDark));
      this.airshipMenuIcon.setAlpha(airshipAffordable ? 1 : 0.45);
      this.airshipMenuCostText.setColor(airshipAffordable ? C.gold : C.hpBad);
    }
  }

  private closeBuildMenu(): void {
    this.menuKind = null;
    this.setManageLabels(false);
    this.setBombChoiceVisible(false);
    this.menuSlotIndex = null;
    this.tweens.killTweensOf(this.buildMenu);
    this.buildMenu.setVisible(false);
    this.rangePreview.setVisible(false);
  }

  // ------------------------------------------------------------------- sync

  // No delta parameter: the walk is driven entirely by distance travelled, not elapsed time.
  private syncEnemies(): void {
    const seen = new Set<number>();

    for (const enemy of this.world.enemies) {
      seen.add(enemy.id);
      let view = this.enemyViews.get(enemy.id);

      if (!view) {
        // Sized to a target on-screen height rather than a fixed multiplier, so the source
        // resolution of the texture stops mattering. `radius` is left alone — that is hit
        // tolerance in the simulation, not a drawing size.
        const body = this.add.image(0, 0, `${WALK_ATLASES[enemy.kind]}-side`, "walk_0");

        const displayHeight = ENEMY_DISPLAY_HEIGHT[enemy.kind];
        // Every atlas frame is the same height, so this scale holds for all of them.
        const baseScale = displayHeight / body.height;
        body.setScale(baseScale);

        const width = enemy.kind === "grunt" ? 40 : enemy.kind === "elf" ? 38 : 34;
        const barY = -displayHeight * 0.5 - 10;

        const hpBackground = this.add
          .rectangle(0, barY, width, 7, hex(C.hpBack))
          .setStrokeStyle(1.5, hex(C.outline));
        const hpFill = this.add
          .rectangle(-width / 2, barY, width, 4, hex(C.hpGood))
          .setOrigin(0, 0.5);

        const container = this.add.container(enemy.x, enemy.y, [body, hpBackground, hpFill]);

        // Pop in so spawns are noticeable at the map edge.
        container.setScale(0.4);
        this.tweens.add({ targets: container, scale: 1, duration: 220, ease: "Back.easeOut" });

        view = { container, body, hpBackground, hpFill, baseScale };
        this.enemyViews.set(enemy.id, view);
      }

      view.container.setPosition(enemy.x, enemy.y).setDepth(groundDepth(enemy.y));

      const displayHeight = ENEMY_DISPLAY_HEIGHT[enemy.kind];
      const footOffset = FOOT_BELOW_CENTRE - displayHeight / 2;
      const stride = displayHeight * STRIDE_FACTOR;
      // Phase comes from how far this enemy has walked, so the step rate follows its speed.
      const pose = walkPose(enemy.travelled, stride);

      const facing = walkView(enemy.angle);
      const attacking = enemy.kind === "elf" && enemy.attackTimer > 0;
      const key = attacking ? "elf-attack" : `${WALK_ATLASES[enemy.kind]}-${facing}`;
      // Frames are advanced by distance too, not by a timer, so the drawn footfalls stay
      // locked to the bob and to how fast the unit is actually moving.
      const count = frameCount(this, key);
      const step = attacking
        ? Math.min(count - 1, Math.floor((1 - enemy.attackTimer / ELF_ATTACK.animationTime) * count))
        : Math.floor((enemy.travelled / stride) * count);
      view.body.setTexture(key, `walk_${((step % count) + count) % count}`);
      view.body.setFlipX((attacking || facing === "side") && Math.abs(enemy.angle) > Math.PI / 2);

      // Drawn legs already carry most of the motion, so the procedural pose is dialled right
      // back - at full strength the two read as a limp.
      const damp = 0.35;
      view.body.setY(footOffset + pose.lift * damp);
      view.body.setX(pose.sway * damp);
      view.body.setRotation(pose.lean * damp);
      view.body.setScale(
        view.baseScale * (1 + (pose.squashX - 1) * damp),
        view.baseScale * (1 + (pose.squashY - 1) * damp),
      );

      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      const width = enemy.kind === "grunt" ? 40 : enemy.kind === "elf" ? 38 : 34;
      view.hpFill.setDisplaySize(width * ratio, 4);
      view.hpFill.setFillStyle(hex(ratio > 0.5 ? C.hpGood : ratio > 0.25 ? C.gold : C.hpBad));

      const damaged = ratio < 1;
      view.hpBackground.setVisible(damaged);
      view.hpFill.setVisible(damaged);
    }

    for (const [id, view] of this.enemyViews) {
      if (!seen.has(id)) {
        view.container.destroy();
        this.enemyViews.delete(id);
      }
    }
  }

  private syncTowers(): void {
    for (const tower of this.world.towers) {
      let view = this.towerViews.get(tower.id);

      if (!view) {
        const body =
          tower.kind === "bomb"
            ? this.add.image(0, 10, "bomb-tower").setOrigin(0.5, 1)
            : this.add.image(0, 10, "tower", "walk_4").setOrigin(0.5, 1);
        body.setScale(TOWER_DISPLAY_HEIGHT / body.height);

        // A notch per round, so the count is readable rather than approximate. The drawn
        // quiver only had three states, which told you roughly how full a tower was but never
        // how many shots were actually left.
        const total = SUPPLY.towerAmmoMax;
        const span = total * AMMO_PIP.width + (total - 1) * AMMO_PIP.gap;
        const pips: Phaser.GameObjects.Rectangle[] = [];
        for (let i = 0; i < total; i++) {
          pips.push(
            this.add
              .rectangle(
                -span / 2 + i * (AMMO_PIP.width + AMMO_PIP.gap),
                AMMO_PIP.y,
                AMMO_PIP.width,
                AMMO_PIP.height,
                hex(C.wood),
              )
              .setOrigin(0, 0.5)
              .setStrokeStyle(1, hex(C.outline)),
          );
        }

        const fireTotal = SUPPLY.incendiaryAmmoMax;
        const fireSpan =
          fireTotal * FIRE_AMMO_PIP.width + (fireTotal - 1) * FIRE_AMMO_PIP.gap;
        const firePips: Phaser.GameObjects.Rectangle[] = [];
        for (let i = 0; i < fireTotal; i++) {
          firePips.push(
            this.add
              .rectangle(
                -fireSpan / 2 + i * (FIRE_AMMO_PIP.width + FIRE_AMMO_PIP.gap),
                FIRE_AMMO_PIP.y,
                FIRE_AMMO_PIP.width,
                FIRE_AMMO_PIP.height,
                0xff7a18,
              )
              .setOrigin(0, 0.5)
              .setStrokeStyle(1, hex(C.outline))
              .setVisible(false),
          );
        }

        // A small red crossed-arrow badge makes an empty tower readable even when its tiny
        // ammo pips are hard to inspect on a phone screen.
        const dryBadgeBack = this.add
          .circle(0, 0, 15, 0x9e2f25, 0.98)
          .setStrokeStyle(3, hex(C.outline));
        const dryBadgeArt = this.add.graphics();
        dryBadgeArt.lineStyle(3, 0xf5dfad, 1);
        dryBadgeArt.beginPath();
        dryBadgeArt.moveTo(-8, 5);
        dryBadgeArt.lineTo(8, -5);
        dryBadgeArt.moveTo(5, -7);
        dryBadgeArt.lineTo(8, -5);
        dryBadgeArt.lineTo(6, -1);
        dryBadgeArt.strokePath();
        dryBadgeArt.lineStyle(4, 0xffd34e, 1);
        dryBadgeArt.beginPath();
        dryBadgeArt.moveTo(-9, -9);
        dryBadgeArt.lineTo(9, 9);
        dryBadgeArt.strokePath();
        const dryBadge = this.add
          .container(0, -101, [dryBadgeBack, dryBadgeArt])
          .setVisible(false);

        const container = this.add.container(tower.x, tower.y, [body, ...pips, ...firePips, dryBadge]);
        container.setScale(0.3);
        this.tweens.add({ targets: container, scale: 1, duration: 260, ease: "Back.easeOut" });
        this.tweens.add({
          targets: dryBadge,
          scale: 1.12,
          duration: 520,
          ease: "Sine.easeInOut",
          yoyo: true,
          repeat: -1,
        });

        view = { container, body, pips, firePips, dryBadge };
        this.towerViews.set(tower.id, view);
      }

      view.container.setDepth(groundDepth(tower.y));
      if (tower.kind === "archer") {
        view.body.setTexture(
          tower.level === 2 ? "tower-2" : "tower",
          `walk_${towerAimFrame(tower.facing)}`,
        );
      } else {
        view.body.setTexture(tower.level === 2 ? "bomb-tower-2" : "bomb-tower");
      }

      view.pips.forEach((pip, i) => {
        const loaded = i < tower.ammo;
        pip.setFillStyle(hex(loaded ? C.wood : C.hpBack));
        pip.setAlpha(loaded ? 1 : 0.45);
      });
      view.firePips.forEach((pip, i) => {
        const loaded = i < tower.incendiaryAmmo;
        pip.setVisible(tower.incendiaryMagazineActive);
        pip.setFillStyle(loaded ? 0xff7a18 : 0x4d2019);
        pip.setAlpha(loaded ? 1 : 0.52);
      });
      view.dryBadge.setVisible(
        tower.ammo <
          (tower.kind === "bomb" && tower.level === 2
            ? SUPPLY.bombAmmoPerShot
            : SUPPLY.ammoPerShot) &&
          tower.incendiaryAmmo <
            (tower.kind === "bomb" && tower.level === 2
              ? SUPPLY.bombAmmoPerShot
              : SUPPLY.ammoPerShot),
      );
    }
  }

  private syncPorters(): void {
    for (const porter of this.world.porters) {
      let view = this.porterViews.get(porter.id);

      if (!view) {
        const isAirship = porter.kind === "airship";
        const body = isAirship
          ? this.add.image(0, 0, "goblin-airship")
          : this.add.image(0, 0, `${PORTER_ATLAS}-side`, "walk_0");
        const baseScale = (isAirship ? AIRSHIP_DISPLAY_HEIGHT : PORTER_DISPLAY_HEIGHT) / body.height;
        body.setScale(baseScale);

        // A strong crimson wash makes the specialist readable even before its cargo is
        // visible; the old pale-orange tint was almost indistinguishable at phone scale.
        if (porter.kind === "incendiary") body.setTint(0xff735a);
        const fireCargo = this.add
          .image(9, -31, "fire-ammo-crate")
          .setDisplaySize(31, 31)
          .setVisible(false);
        const container = this.add.container(porter.x, porter.y, [body, fireCargo]);

        view = { container, body, fireCargo, baseScale, walked: 0, lastX: porter.x, lastY: porter.y };
        this.porterViews.set(porter.id, view);
      }

      // Porters have no `travelled` of their own, so distance is accumulated from movement.
      // It also means one waiting at the depot simply stops animating, which is correct.
      view.walked += Math.hypot(porter.x - view.lastX, porter.y - view.lastY);
      view.lastX = porter.x;
      view.lastY = porter.y;

      const isAirship = porter.kind === "airship";
      const airBob = isAirship
        ? Math.sin(this.world.elapsed * 3 + porter.id) * (0.8 + porter.altitude * 2.2)
        : 0;
      view.container
        .setPosition(porter.x, porter.y + (isAirship ? -18 - porter.altitude * 42 + airBob : 0))
        .setDepth(isAirship ? DEPTH.projectile - 1 : groundDepth(porter.y));

      // Empty porters wait at the depot coordinate. Leaving their sprite there makes them
      // stand motionless over the roof, so hide them once they cross the doorway. A loaded
      // porter remains visible at the same coordinate because it is just walking back out.
      const insideDepot =
        porter.carrying === 0 &&
        Math.hypot(porter.x - this.world.depot.x, porter.y - this.world.depot.y) <= DEPOT_INTERIOR_RADIUS &&
        (porter.kind !== "airship" || porter.altitude <= 0.01);
      view.container.setVisible(!insideDepot);
      view.fireCargo.setVisible(porter.kind === "incendiary" && porter.carrying > 0);

      if (isAirship) {
        view.body.setFlipX(Math.abs(porter.angle) > Math.PI / 2);
        view.body.setRotation(Math.sin(this.world.elapsed * 2.4 + porter.id) * 0.025);
        continue;
      }

      const facing = walkView(porter.angle);
      const atlas = porter.fleeing ? PORTER_FLEE_ATLAS : PORTER_ATLAS;
      const key = `${atlas}-${facing}`;
      const count = frameCount(this, key);
      const stride = PORTER_DISPLAY_HEIGHT * (porter.fleeing ? 0.38 : STRIDE_FACTOR);
      const step = Math.floor((view.walked / stride) * count);
      view.body.setTexture(key, `walk_${((step % count) + count) % count}`);
      view.body.setFlipX(facing === "side" && Math.abs(porter.angle) > Math.PI / 2);

      const pose = walkPose(view.walked, stride);
      view.body.setY(FOOT_BELOW_CENTRE - PORTER_DISPLAY_HEIGHT / 2 + pose.lift * 0.35);
      view.body.setX(pose.sway * 0.35);
      view.body.setRotation(pose.lean * 0.35);
    }

    this.refreshDepotGate();
  }

  /** Opens the gate for whichever porter is closest to the door. */
  private refreshDepotGate(): void {
    let nearest = Infinity;
    for (const porter of this.world.porters) {
      nearest = Math.min(
        nearest,
        Math.hypot(porter.x - this.world.depot.x, porter.y - this.world.depot.y),
      );
    }

    const frame =
      nearest < 40 ? DEPOT_GATE.open : nearest < 90 ? DEPOT_GATE.ajar : DEPOT_GATE.shut;

    // The permanent image beneath this overlay is already the open state. Hiding the
    // overlay therefore opens the doorway without redrawing any other part of the depot.
    if (frame === DEPOT_GATE.open) {
      this.depotGateSprite.setVisible(false);
    } else {
      this.depotGateSprite
        .setVisible(true)
        .setFrame(`walk_${frame}`)
        // Phaser clears a frame-specific crop when the atlas frame changes.
        .setCrop(
          DEPOT_GATE_CROP.x,
          DEPOT_GATE_CROP.y,
          DEPOT_GATE_CROP.width,
          DEPOT_GATE_CROP.height,
        );
    }

    this.depotPorterPips.forEach((pip, i) => {
      const porter = this.world.porters[i];
      const hired = porter !== undefined;
      pip.setFillStyle(
        hired
          ? porter.kind === "incendiary"
            ? 0xff7a18
            : porter.kind === "airship"
              ? 0x8fd6ff
              : hex(C.accent)
          : hex(C.hpBack),
      );
      pip.setAlpha(hired ? 1 : 0.45);
    });
  }

  private syncProjectiles(): void {
    const seen = new Set<number>();

    for (const projectile of this.world.projectiles) {
      seen.add(projectile.id);
      let sprite = this.projectileViews.get(projectile.id);

      if (!sprite) {
        sprite = this.add
          .image(projectile.x, projectile.y, projectile.kind === "bomb" ? "bomb" : "arrow")
          .setDepth(DEPTH.projectile);
        if (projectile.kind === "bomb") {
          sprite.setDisplaySize(22, (22 * sprite.height) / sprite.width);
        }
        if (projectile.incendiary) sprite.setTint(0xff9b32);
        this.projectileViews.set(projectile.id, sprite);
      }

      if (projectile.kind === "bomb") {
        const progress = Math.min(1, projectile.flight / Math.max(1, projectile.flightDistance));
        const arc = Math.sin(progress * Math.PI) * 42;
        sprite
          .setPosition(projectile.x, projectile.y - arc)
          .setRotation(progress * Math.PI * 4);
      } else {
        sprite.setPosition(projectile.x, projectile.y).setRotation(projectile.angle);
      }
    }

    for (const [id, sprite] of this.projectileViews) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.projectileViews.delete(id);
      }
    }
  }

  /** Pads draw nothing of their own now; only the popup still needs a per-frame refresh. */
  private refreshPads(): void {
    this.refreshMenuAffordability();
  }

  // ----------------------------------------------------------------- effects

  private drainEvents(): void {
    const events = this.world.events;
    if (events.length === 0) return;
    this.world.events = [];

    for (const event of events) {
      this.handleEvent(event);
    }
  }

  private handleEvent(event: GameEvent): void {
    switch (event.type) {
      case "fire":
        if (event.towerKind === "archer") {
          this.muzzleFlash(event.x, event.y, event.angle);
          this.playEffect(SOUND_EFFECTS.arrowFlight.key, 0.34, 45);
        }
        if (event.incendiary) this.burst("spark", event.x, event.y, 1.1);
        break;
      case "hit":
        this.burst("spark", event.x, event.y, event.incendiary ? 1.35 : 0.9);
        if (event.towerKind === "archer") {
          this.playEffect(SOUND_EFFECTS.arrowHit.key, 0.42, 35);
        }
        break;
      case "explode":
        this.explosion(event.x, event.y, event.radius);
        break;
      case "kill":
        this.burst("puff", event.x, event.y, 1.2);
        this.floatingText(event.x, event.y, `+${event.bounty}`, C.gold);
        break;
      case "leak":
        this.cameras.main.shake(220, 0.006);
        this.cameras.main.flash(180, 200, 60, 40);
        this.floatingText(event.x, event.y, `-${event.damage}`, C.hpBad);
        break;
      case "build":
        this.burst("puff", event.x, event.y, 1.5);
        this.playEffect(SOUND_EFFECTS.build.key, 0.52);
        this.closeBuildMenu();
        break;
      case "upgrade":
        this.burst("puff", event.x, event.y - 18, 2.0);
        this.floatingText(event.x, event.y - 42, "LEVEL II", C.gold);
        this.playEffect(SOUND_EFFECTS.build.key, 0.48);
        this.closeBuildMenu();
        break;
      case "deliver":
        this.burst("puff", event.x, event.y - 10, 1.0);
        this.floatingText(
          event.x,
          event.y - 20,
          `+${event.amount}`,
          event.porterKind === "incendiary" ? "#ff8a22" : C.wood,
        );
        break;
      case "hire":
        this.burst("puff", event.x, event.y, 1.4);
        this.floatingText(
          event.x,
          event.y - 30,
          "+1",
          event.porterKind === "incendiary" ? "#ff8a22" : C.accent,
        );
        this.playGoblinPhrase();
        this.closeBuildMenu();
        break;
      case "porterAttacked":
        this.burst("puff", event.x, event.y - 12, 1.25);
        this.floatingText(event.x, event.y - 30, "CARGO LOST!", C.hpBad);
        break;
      case "elfFire": {
        const angle = Math.atan2(event.targetY - event.y, event.targetX - event.x);
        const arrow = this.add
          .image(event.x, event.y, "arrow")
          .setRotation(angle)
          .setDepth(DEPTH.projectile);
        this.tweens.add({
          targets: arrow,
          x: event.targetX,
          y: event.targetY,
          duration: 280,
          ease: "Linear",
          onComplete: () => {
            this.burst("spark", event.targetX, event.targetY, 0.75);
            arrow.destroy();
          },
        });
        break;
      }
      case "sell": {
        this.burst("puff", event.x, event.y - 20, 1.8);
        this.floatingText(event.x, event.y - 30, `+${event.refund}`, C.gold);
        this.playEffect(SOUND_EFFECTS.sell.key, 0.52);
        this.closeBuildMenu();
        // The tower is gone from the simulation; drop its sprite with it.
        for (const [id, view] of this.towerViews) {
          if (!this.world.towers.some((t) => t.id === id)) {
            view.container.destroy();
            this.towerViews.delete(id);
          }
        }
        break;
      }
      case "waveStart":
        this.announceWave(event.wave);
        break;
      default:
        break;
    }
  }

  private playEffect(key: string, volume: number, minimumGapMs = 0): void {
    const now = this.time.now;
    if (now - (this.lastSoundAt.get(key) ?? -Infinity) < minimumGapMs) return;
    this.lastSoundAt.set(key, now);
    this.sound.play(key, { volume });
  }

  private playGoblinPhrase(): void {
    const count = SOUND_EFFECTS.hire.length;
    let index = Phaser.Math.Between(0, count - 1);
    if (count > 1 && index === this.lastGoblinPhrase) index = (index + 1) % count;
    this.lastGoblinPhrase = index;
    this.playEffect(SOUND_EFFECTS.hire[index]!.key, 0.64);
  }

  private muzzleFlash(x: number, y: number, angle: number): void {
    // The event already carries the bow's position, so this only needs to nudge the flash
    // out along the shot.
    const offset = 18;
    const flash = this.add
      .image(x + Math.cos(angle) * offset, y + Math.sin(angle) * offset, "spark")
      .setDepth(DEPTH.effect)
      .setScale(0.5)
      .setTint(hex(C.gold));

    this.tweens.add({
      targets: flash,
      scale: 0.9,
      alpha: 0,
      duration: 130,
      onComplete: () => flash.destroy(),
    });
  }

  private burst(texture: string, x: number, y: number, scale: number): void {
    const sprite = this.add.image(x, y, texture).setDepth(DEPTH.effect).setScale(scale * 0.4);
    this.tweens.add({
      targets: sprite,
      scale,
      alpha: 0,
      duration: 300,
      ease: "Quad.easeOut",
      onComplete: () => sprite.destroy(),
    });
  }

  private explosion(x: number, y: number, radius: number): void {
    const blast = this.add
      .circle(x, y, 12, 0xff8a22, 0.78)
      .setStrokeStyle(5, 0xffd35a, 0.95)
      .setDepth(DEPTH.effect);
    const smoke = this.add.image(x, y, "puff").setDepth(DEPTH.effect).setScale(0.5);
    this.tweens.add({
      targets: blast,
      radius,
      alpha: 0,
      duration: 280,
      ease: "Quad.easeOut",
      onComplete: () => blast.destroy(),
    });
    this.tweens.add({
      targets: smoke,
      scale: 1.8,
      alpha: 0,
      duration: 430,
      onComplete: () => smoke.destroy(),
    });
    this.cameras.main.shake(110, 0.0025);
  }

  private floatingText(x: number, y: number, message: string, color: string): void {
    const label = this.add
      .text(x, y - 18, message, {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "22px",
        color,
        stroke: C.outline,
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.effect);

    this.tweens.add({
      targets: label,
      y: y - 56,
      alpha: 0,
      duration: 750,
      ease: "Quad.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  private announceWave(wave: number): void {
    const label = this.add
      .text(VIEW.width / 2, 150, `Wave ${wave}`, {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: "56px",
        color: C.parchment,
        stroke: C.outline,
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.effect)
      .setAlpha(0)
      .setScale(0.7);

    this.tweens.add({
      targets: label,
      alpha: 1,
      scale: 1,
      duration: 260,
      ease: "Back.easeOut",
      yoyo: true,
      hold: 700,
      onComplete: () => label.destroy(),
    });
  }
}
