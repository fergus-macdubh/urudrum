import Phaser from "phaser";
import { ECONOMY, SUPPLY, VIEW } from "../sim/config";
import { C, hex } from "./palette";
import type { GameScene } from "./GameScene";

const SERIF = "Georgia, 'Times New Roman', serif";

const END_BUTTON_ART = {
  replay: "menu-button-play-again",
  menu: "menu-button-main-menu",
} as const;

const END_PANEL_ART = {
  victory: "end-panel-victory",
  defeat: "end-panel-defeat",
} as const;

const PAUSE_PANEL_ART = "pause-panel";

const UI_CLICK = { key: "sfx-ui-click", url: "audio/ui-click.mp3" } as const;

const END_SOUNDS = {
  victory: { key: "sfx-victory", url: "audio/victory.mp3" },
  defeat: { key: "sfx-defeat", url: "audio/defeat.mp3" },
} as const;

/**
 * Overlay scene: resource counters and the end-of-run panel. Kept separate from GameScene
 * so camera shake and flashes on the board never move the UI.
 */
export class HudScene extends Phaser.Scene {
  private game_!: GameScene;

  private goldText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private porterText!: Phaser.GameObjects.Text;

  private overlay?: Phaser.GameObjects.Container;
  private pauseOverlay?: Phaser.GameObjects.Container;
  private lastStatus: string = "playing";
  private lastLives = -1;

  constructor() {
    super("Hud");
  }

  preload(): void {
    for (const key of Object.values(END_BUTTON_ART)) {
      if (!this.textures.exists(key)) this.load.image(key, `sprites/${key}.png`);
    }
    for (const key of Object.values(END_PANEL_ART)) {
      if (!this.textures.exists(key)) this.load.image(key, `sprites/${key}.png`);
    }
    if (!this.textures.exists(PAUSE_PANEL_ART)) {
      this.load.image(PAUSE_PANEL_ART, `sprites/${PAUSE_PANEL_ART}.png`);
    }
    if (!this.cache.audio.exists(UI_CLICK.key)) this.load.audio(UI_CLICK.key, UI_CLICK.url);
    for (const effect of Object.values(END_SOUNDS)) {
      if (!this.cache.audio.exists(effect.key)) this.load.audio(effect.key, effect.url);
    }
  }

  create(): void {
    this.game_ = this.scene.get("Game") as GameScene;

    this.buildBanner();

    this.input.keyboard?.on("keydown-ESC", (event: KeyboardEvent) => {
      if (!event.repeat) this.togglePause();
    });

    // A fresh Game scene means a fresh run; drop any stale end-of-run panel.
    this.game_.events.on("start", () => {
      this.overlay?.destroy();
      this.overlay = undefined;
      this.pauseOverlay?.destroy();
      this.pauseOverlay = undefined;
      this.lastStatus = "playing";
    });
  }

  private togglePause(): void {
    if (!this.game_?.world || this.game_.world.status !== "playing") return;

    if (this.scene.isPaused("Game")) {
      this.scene.resume("Game");
      this.pauseOverlay?.destroy();
      this.pauseOverlay = undefined;
      return;
    }

    this.scene.pause("Game");
    this.showPauseOverlay();
  }

  private showPauseOverlay(): void {
    if (this.pauseOverlay) return;

    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    const dim = this.add
      .rectangle(cx, cy, VIEW.width, VIEW.height, 0x000000, 0.58)
      .setInteractive();
    const panel = this.add.image(cx, cy, PAUSE_PANEL_ART);
    panel.setDisplaySize(680, (680 * panel.height) / panel.width);

    this.pauseOverlay = this.add
      .container(0, 0, [dim, panel])
      .setDepth(200)
      .setAlpha(0);
    this.tweens.add({ targets: this.pauseOverlay, alpha: 1, duration: 140 });
  }

  private buildBanner(): void {
    const panel = this.add.graphics();
    // Near-opaque: at 0.88 the scenery behind the banner showed through and muddied the digits.
    panel.fillStyle(hex(C.panel), 0.97);
    panel.fillRoundedRect(14, 12, 566, 60, 14);
    panel.lineStyle(4, hex(C.panelLight), 1);
    panel.strokeRoundedRect(14, 12, 566, 60, 14);

    this.coinIcon(40, 42);
    this.goldText = this.label(52, 42, `${ECONOMY.startGold}`, C.gold);

    this.heartIcon(190, 42);
    this.livesText = this.label(202, 42, `${ECONOMY.startLives}`, C.hpBad);

    this.waveIcon(330, 42);
    this.waveText = this.label(342, 42, "1/5", C.parchment);

    this.crateIcon(460, 42);
    this.porterText = this.label(472, 42, `${SUPPLY.startingPorters}`, C.parchment);
  }

  /** Crate glyph for the porter count — the same object porters carry. */
  private crateIcon(x: number, y: number): void {
    const g = this.add.graphics({ x, y });
    g.fillStyle(hex(C.wood), 1);
    g.lineStyle(3, hex(C.outline), 1);
    g.fillRoundedRect(-10, -9, 20, 18, 3);
    g.strokeRoundedRect(-10, -9, 20, 18, 3);
    g.lineStyle(2.2, hex(C.woodDark), 1);
    g.beginPath();
    g.moveTo(-10, -2.5);
    g.lineTo(10, -2.5);
    g.moveTo(-10, 3);
    g.lineTo(10, 3);
    g.strokePath();
  }

  private coinIcon(x: number, y: number): void {
    this.add.circle(x, y, 11, hex(C.goldDark)).setStrokeStyle(3, hex(C.outline));
    this.add.circle(x, y - 1, 6, hex(C.gold));
  }

  private heartIcon(x: number, y: number): void {
    // Two lobes and a point — cheaper and more legible at this size than a font glyph.
    const g = this.add.graphics({ x, y });
    g.fillStyle(hex(C.hpBad), 1);
    g.lineStyle(3, hex(C.outline), 1);
    g.beginPath();
    g.arc(-5, -3, 6, Math.PI, 0);
    g.arc(5, -3, 6, Math.PI, 0);
    g.lineTo(0, 10);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  private waveIcon(x: number, y: number): void {
    // Crossed swords. Drawn rather than typed: the ⚔ glyph falls back to a box on Android.
    const g = this.add.graphics({ x, y });
    g.lineStyle(4, hex(C.stoneLight), 1);
    g.beginPath();
    g.moveTo(-8, 9);
    g.lineTo(8, -9);
    g.moveTo(8, 9);
    g.lineTo(-8, -9);
    g.strokePath();
    g.lineStyle(3, hex(C.woodDark), 1);
    g.beginPath();
    g.moveTo(-9, 10);
    g.lineTo(-5, 6);
    g.moveTo(9, 10);
    g.lineTo(5, 6);
    g.strokePath();
  }

  private label(x: number, y: number, text: string, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x + 14, y, text, {
        fontFamily: SERIF,
        fontSize: "28px",
        color,
        stroke: C.outline,
        strokeThickness: 5,
      })
      .setOrigin(0, 0.5);
  }

  override update(): void {
    const world = this.game_?.world;
    if (!world) return;

    this.goldText.setText(`${world.gold}`);
    this.waveText.setText(`${Math.max(1, world.currentWave)}/${world.totalWaves}`);
    this.porterText.setText(`${world.porters.length}`);
    this.porterText.setColor(world.porters.length >= SUPPLY.maxPorters ? C.stoneMid : C.parchment);

    if (world.lives !== this.lastLives) {
      this.livesText.setText(`${world.lives}`);
      if (this.lastLives >= 0) {
        // Punch the counter so a leak is impossible to miss.
        this.livesText.setScale(1.6);
        this.tweens.add({ targets: this.livesText, scale: 1, duration: 320, ease: "Back.easeOut" });
      }
      this.lastLives = world.lives;
    }

    if (world.status !== "playing" && this.lastStatus === "playing") {
      this.lastStatus = world.status;
      this.showEndPanel(world.status === "won");
    }
  }

  private showEndPanel(won: boolean): void {
    if (won) this.game_.recordVictory();
    this.sound.play(won ? END_SOUNDS.victory.key : END_SOUNDS.defeat.key, { volume: 0.62 });

    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;

    const dim = this.add.rectangle(cx, cy, VIEW.width, VIEW.height, 0x000000, 0.55);

    const panel = this.add.image(
      cx,
      cy,
      won ? END_PANEL_ART.victory : END_PANEL_ART.defeat,
    );
    panel.setDisplaySize(570, (570 * panel.height) / panel.width);

    const world = this.game_.world;
    const subtitle = this.add
      .text(
        cx,
        cy + 22,
        won
          ? `${world.lives} of ${ECONOMY.startLives} lives remaining`
          : "The horde broke through",
        {
          fontFamily: SERIF,
          fontSize: "22px",
          color: C.parchment,
          stroke: C.outline,
          strokeThickness: 4,
        },
      )
      .setOrigin(0.5);

    const replayButton = this.add.image(cx - 122, cy + 102, END_BUTTON_ART.replay);
    replayButton.setDisplaySize(210, (210 * replayButton.height) / replayButton.width);
    const replayHit = this.add
      .zone(cx - 122, cy + 102, replayButton.displayWidth, replayButton.displayHeight)
      .setInteractive({ useHandCursor: true });
    replayHit.on("pointerover", () => replayButton.setTint(0xffefc2));
    replayHit.on("pointerout", () => replayButton.clearTint());
    replayHit.on("pointerdown", () => {
      this.sound.play(UI_CLICK.key, { volume: 0.24 });
      this.overlay?.destroy();
      this.overlay = undefined;
      this.lastStatus = "playing";
      this.lastLives = -1;
      this.game_.restart();
    });

    const menuButton = this.add.image(cx + 122, cy + 102, END_BUTTON_ART.menu);
    menuButton.setDisplaySize(210, (210 * menuButton.height) / menuButton.width);
    const menuHit = this.add
      .zone(cx + 122, cy + 102, menuButton.displayWidth, menuButton.displayHeight)
      .setInteractive({ useHandCursor: true });
    menuHit.on("pointerover", () => menuButton.setTint(0xffefc2));
    menuHit.on("pointerout", () => menuButton.clearTint());
    menuHit.on("pointerdown", () => {
      this.sound.play(UI_CLICK.key, { volume: 0.24 });
      this.scene.stop("Game");
      this.scene.start("Menu");
    });

    this.overlay = this.add
      .container(0, 0, [
        dim,
        panel,
        subtitle,
        replayButton,
        replayHit,
        menuButton,
        menuHit,
      ])
      .setDepth(100);

    this.overlay.setAlpha(0);
    this.tweens.add({ targets: this.overlay, alpha: 1, duration: 300 });
  }
}
