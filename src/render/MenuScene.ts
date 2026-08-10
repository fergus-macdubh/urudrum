import Phaser from "phaser";
import { LEVEL_COUNT, createSave, loadSaveSlots, markLevelStarted } from "../save";
import type { SaveSlot } from "../save";
import { VIEW } from "../sim/config";
import { C } from "./palette";

const MENU_FONT = "'Bungee', 'Arial Black', sans-serif";

const MENU_BACKGROUND_URL = "sprites/start_screen_bg.png";
const UI_CLICK = { key: "sfx-ui-click", url: "audio/ui-click.mp3" } as const;

const MENU_BUTTON_ART = {
  new: "menu-button-new",
  continue: "menu-button-continue",
  exit: "menu-button-exit",
  slot1: "menu-button-slot-1",
  slot2: "menu-button-slot-2",
  slot3: "menu-button-slot-3",
  level1: "menu-button-level-1",
  back: "menu-button-back",
  returnMenu: "menu-button-return-menu",
} as const;

type SlotMode = "new" | "continue";

export class MenuScene extends Phaser.Scene {
  private screen?: Phaser.GameObjects.Container;

  constructor() {
    super("Menu");
  }

  preload(): void {
    if (!this.textures.exists("menu-background")) {
      this.load.image("menu-background", MENU_BACKGROUND_URL);
    }
    if (!this.textures.exists("menu-logo")) {
      this.load.image("menu-logo", "sprites/menu-logo.png");
    }
    for (const key of Object.values(MENU_BUTTON_ART)) {
      if (!this.textures.exists(key)) this.load.image(key, `sprites/${key}.png`);
    }
    if (!this.cache.audio.exists(UI_CLICK.key)) this.load.audio(UI_CLICK.key, UI_CLICK.url);
  }

  create(): void {
    this.add
      .image(VIEW.width / 2, VIEW.height / 2, "menu-background")
      .setDisplaySize(VIEW.width, VIEW.height);

    this.showMainMenu();
  }

  private replaceScreen(): Phaser.GameObjects.Container {
    this.screen?.destroy(true);
    this.screen = this.add.container(0, 0).setDepth(10);
    return this.screen;
  }

  private title(container: Phaser.GameObjects.Container, title: string, subtitle: string): void {
    container.add(
      this.add
        .text(VIEW.width / 2, 138, title, {
          fontFamily: MENU_FONT,
          fontSize: "50px",
          color: C.gold,
          stroke: C.outline,
          strokeThickness: 9,
          shadow: { offsetX: 0, offsetY: 6, color: "#000000", blur: 8, fill: true },
        })
        .setOrigin(0.5),
    );
    container.add(
      this.add
        .text(VIEW.width / 2, 196, subtitle, {
          fontFamily: MENU_FONT,
          fontSize: "16px",
          color: C.parchment,
          stroke: C.outline,
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    );
  }

  /** Fully illustrated sign: both the cracked plank and lettering come from one asset. */
  private artButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    texture: string,
    width: number,
    disabled: boolean,
    onPress: () => void,
    subtitle?: string,
  ): Phaser.GameObjects.Container {
    const sign = this.add.image(0, 0, texture);
    sign.setDisplaySize(width, (width * sign.height) / sign.width);

    const children: Phaser.GameObjects.GameObject[] = [sign];
    if (subtitle) {
      children.push(
        this.add
          .text(0, sign.displayHeight * 0.34, subtitle, {
            fontFamily: MENU_FONT,
            fontSize: "11px",
            color: disabled ? C.stoneMid : C.parchment,
            stroke: C.outline,
            strokeThickness: 4,
          })
          .setOrigin(0.5),
      );
    }

    const button = this.add.container(x, y, children);
    container.add(button);

    if (disabled) {
      sign.setTint(0x777777).setAlpha(0.74);
      return button;
    }

    const hitArea = this.add
      .zone(0, 0, sign.displayWidth, sign.displayHeight)
      .setInteractive({ useHandCursor: true });
    button.add(hitArea);
    hitArea.on("pointerover", () => sign.setTint(0xffefc2));
    hitArea.on("pointerout", () => sign.clearTint());
    hitArea.on("pointerdown", () => {
      this.sound.play(UI_CLICK.key, { volume: 0.24 });
      this.tweens.add({
        targets: button,
        scale: 0.94,
        duration: 65,
        yoyo: true,
        onComplete: onPress,
      });
    });
    return button;
  }

  private showMainMenu(): void {
    const screen = this.replaceScreen();
    const hasSave = loadSaveSlots().some((slot) => slot !== null);
    const logo = this.add.image(VIEW.width / 2, 112, "menu-logo");
    logo.setDisplaySize(500, (500 * logo.height) / logo.width);
    screen.add(logo);

    this.artButton(screen, VIEW.width / 2, 305, MENU_BUTTON_ART.new, 390, false, () =>
      this.showSlots("new"),
    );
    this.artButton(
      screen,
      VIEW.width / 2,
      435,
      MENU_BUTTON_ART.continue,
      390,
      !hasSave,
      () => this.showSlots("continue"),
    );
    this.artButton(screen, VIEW.width / 2, 555, MENU_BUTTON_ART.exit, 290, false, () =>
      this.showExitScreen(),
    );

    screen.setAlpha(0);
    this.tweens.add({ targets: screen, alpha: 1, duration: 220 });
  }

  private showSlots(mode: SlotMode): void {
    const screen = this.replaceScreen();
    const slots = loadSaveSlots();
    this.title(
      screen,
      mode === "new" ? "NEW GAME" : "CONTINUE",
      mode === "new" ? "Choose a save slot" : "Choose a saved game",
    );

    slots.forEach((save, index) => {
      const empty = save === null;
      const disabled = mode === "continue" && empty;
      const texture = [MENU_BUTTON_ART.slot1, MENU_BUTTON_ART.slot2, MENU_BUTTON_ART.slot3][
        index
      ]!;
      this.artButton(
        screen,
        VIEW.width / 2,
        270 + index * 130,
        texture,
        390,
        disabled,
        () => this.showLevels(mode, index, save),
        this.slotSubtitle(save, mode),
      );
    });

    this.backButton(screen, () => this.showMainMenu());
  }

  private slotSubtitle(save: SaveSlot | null, mode: SlotMode): string {
    if (!save) return mode === "new" ? "Empty slot" : "No saved game";
    const completed = save.completedLevels.length > 0 ? " · level completed" : "";
    return mode === "new"
      ? `Level ${save.lastLevel}${completed} · will be replaced`
      : `Last played: Level ${save.lastLevel}${completed}`;
  }

  private showLevels(mode: SlotMode, slotIndex: number, save: SaveSlot | null): void {
    const screen = this.replaceScreen();
    this.title(
      screen,
      "SELECT LEVEL",
      `${mode === "new" ? "New Game" : "Continue"} · Slot ${slotIndex + 1}`,
    );

    const completed = mode === "continue" && save?.completedLevels.includes(1);
    this.artButton(
      screen,
      VIEW.width / 2,
      330,
      MENU_BUTTON_ART.level1,
      440,
      false,
      () => this.startLevel(mode, slotIndex, 1),
      completed ? "GREEN VALLEY · COMPLETED" : "GREEN VALLEY",
    );

    screen.add(
      this.add
        .text(VIEW.width / 2, 438, LEVEL_COUNT === 1 ? "More levels coming soon" : "", {
          fontFamily: MENU_FONT,
          fontSize: "18px",
          color: C.stoneLight,
        })
        .setOrigin(0.5),
    );

    this.backButton(screen, () => this.showSlots(mode));
  }

  private startLevel(mode: SlotMode, slotIndex: number, level: number): void {
    if (mode === "new") createSave(slotIndex);
    markLevelStarted(slotIndex, level);

    this.cameras.main.fadeOut(240, 20, 15, 11);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("Game", { saveSlot: slotIndex, level });
    });
  }

  private backButton(container: Phaser.GameObjects.Container, onPress: () => void): void {
    this.artButton(container, 450, 650, MENU_BUTTON_ART.back, 180, false, onPress);
  }

  private showExitScreen(): void {
    const screen = this.replaceScreen();
    this.title(screen, "SEE YOU SOON!", "This button will close the mobile build");
    screen.add(
      this.add
        .text(VIEW.width / 2, 330, "Game paused", {
          fontFamily: MENU_FONT,
          fontSize: "35px",
          color: C.parchment,
          stroke: C.outline,
          strokeThickness: 5,
        })
        .setOrigin(0.5),
    );
    this.artButton(
      screen,
      VIEW.width / 2,
      465,
      MENU_BUTTON_ART.returnMenu,
      390,
      false,
      () => this.showMainMenu(),
    );
  }
}
