import Phaser from "phaser";
import { createSave, loadSaveSlots, markLevelStarted } from "../save";
import type { SaveSlot } from "../save";
import { VIEW } from "../sim/config";
import { C, hex } from "./palette";

const MENU_FONT = "'Bungee', 'Arial Black', sans-serif";

const MENU_BACKGROUND_URL = "sprites/start_screen_bg.png";
const UI_CLICK = { key: "sfx-ui-click", url: "audio/ui-click.mp3" } as const;

const MENU_BUTTON_ART = {
  new: "menu-button-new",
  continue: "menu-button-continue",
  wiki: "menu-button-wiki",
  exit: "menu-button-exit",
  slot1: "menu-button-slot-1",
  slot2: "menu-button-slot-2",
  slot3: "menu-button-slot-3",
  level1: "menu-button-level-1",
  level2: "menu-button-level-2",
  level3: "menu-button-level-3",
  level4: "menu-button-level-4",
  level5: "menu-button-level-5",
  back: "menu-button-back",
  returnMenu: "menu-button-return-menu",
} as const;

type SlotMode = "new" | "continue";
type WikiCategoryKey = "towers" | "supply" | "enemies";
type WikiPicture = "archer" | "archer-2" | "bomber" | "bomber-2" | "goblin" | "fire-goblin" | "airship" | "peasant" | "grunt" | "elf";

interface WikiEntry {
  title: string;
  description: string;
  picture: WikiPicture;
}

const WIKI_CATEGORIES: Record<WikiCategoryKey, { title: string; entries: WikiEntry[] }> = {
  towers: {
    title: "TOWERS",
    entries: [
      {
        title: "ARCHERS",
        description: "Fast single-target defenders with excellent range. They are most effective against isolated enemies.",
        picture: "archer",
      },
      {
        title: "BOMBERS",
        description: "Slow-firing specialists whose bombs damage every enemy near the impact. Place them beside crossings and crowded lanes.",
        picture: "bomber",
      },
      {
        title: "ARCHERS II",
        description: "Reinforced archers shoot farther, faster, and hit harder. Their superior single-target damage excels against tough enemies.",
        picture: "archer-2",
      },
      {
        title: "BOMBERS II",
        description: "A larger blast and heavier bombs punish dense formations. The upgraded tower remains slower than archers against lone targets.",
        picture: "bomber-2",
      },
    ],
  },
  supply: {
    title: "SUPPLY",
    entries: [
      {
        title: "GOBLIN",
        description: "A reliable porter who carries ordinary ammunition from the supply camp to the emptiest tower.",
        picture: "goblin",
      },
      {
        title: "FIRE GOBLIN",
        description: "A costly specialist who delivers powerful incendiary ammunition to a random tower that needs it.",
        picture: "fire-goblin",
      },
      {
        title: "AIRSHIP GOBLIN",
        description: "A safe but slow flying porter who cannot be targeted by elf archers. Every delivery takes extra time while the airship descends and climbs.",
        picture: "airship",
      },
    ],
  },
  enemies: {
    title: "ENEMIES",
    entries: [
      {
        title: "PEASANT",
        description: "A quick, lightly protected invader. Peasants are weak alone but dangerous when they arrive in numbers.",
        picture: "peasant",
      },
      {
        title: "INFANTRYMAN",
        description: "A trained light infantryman with a short spear, helmet, and leather armor. Tougher than a peasant, but still quick on his feet.",
        picture: "grunt",
      },
      {
        title: "ELF ARCHER",
        description: "A ranged raider who shoots ground porters carrying ammunition while marching with a wave. Flying porters remain safe from his arrows.",
        picture: "elf",
      },
    ],
  },
};

export class MenuScene extends Phaser.Scene {
  private screen?: Phaser.GameObjects.Container;
  private escapeAction?: () => void;

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
    if (!this.textures.exists("wiki-archer")) {
      this.load.atlas("wiki-archer", "sprites/tower.png", "sprites/tower.json");
      this.load.image("wiki-bomber", "sprites/bomb-tower.png");
      this.load.atlas("wiki-archer-2", "sprites/tower-2.png", "sprites/tower-2.json");
      this.load.image("wiki-bomber-2", "sprites/bomb-tower-2.png");
      this.load.atlas("wiki-goblin", "sprites/goblin-side.png", "sprites/goblin-side.json");
      this.load.atlas("wiki-peasant", "sprites/peasant-side.png", "sprites/peasant-side.json");
      this.load.atlas("wiki-grunt", "sprites/grunt-side.png", "sprites/grunt-side.json");
      this.load.image("wiki-fire-goblin", "sprites/wiki-fire-goblin.png");
      this.load.image("wiki-airship", "sprites/goblin-airship.png");
      this.load.atlas("wiki-elf", "sprites/elf-side.png", "sprites/elf-side.json");
    }
    if (!this.cache.audio.exists(UI_CLICK.key)) this.load.audio(UI_CLICK.key, UI_CLICK.url);
  }

  create(): void {
    this.add
      .image(VIEW.width / 2, VIEW.height / 2, "menu-background")
      .setDisplaySize(VIEW.width, VIEW.height);

    this.showMainMenu();

    // Every nested menu gives Escape exactly the same destination as its visible Back
    // button. MenuScene sleeps once gameplay starts, so GameScene keeps ownership of Escape
    // for pausing the battle.
    this.input.keyboard?.on("keydown-ESC", (event: KeyboardEvent) => {
      if (event.repeat || !this.escapeAction) return;
      this.sound.play(UI_CLICK.key, { volume: 0.24 });
      this.escapeAction();
    });

    // Local art/gameplay shortcut for iteration. It is erased from production by Vite's
    // DEV constant, so published players still unlock levels by completing the campaign.
    if (import.meta.env.DEV) {
      this.input.keyboard?.on("keydown-F2", () => {
        this.scene.start("Game", { saveSlot: -1, level: 2 });
      });
      this.input.keyboard?.on("keydown-F3", () => {
        this.scene.start("Game", { saveSlot: -1, level: 3 });
      });
      this.input.keyboard?.on("keydown-F4", () => {
        this.scene.start("Game", { saveSlot: -1, level: 4 });
      });
      this.input.keyboard?.on("keydown-F5", () => {
        this.scene.start("Game", { saveSlot: -1, level: 5 });
      });
    }
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
    this.escapeAction = undefined;
    const screen = this.replaceScreen();
    const hasSave = loadSaveSlots().some((slot) => slot !== null);
    const logo = this.add.image(VIEW.width / 2, 112, "menu-logo");
    logo.setDisplaySize(500, (500 * logo.height) / logo.width);
    screen.add(logo);

    this.artButton(screen, VIEW.width / 2, 285, MENU_BUTTON_ART.new, 360, false, () =>
      this.showSlots("new"),
    );
    this.artButton(
      screen,
      VIEW.width / 2,
      395,
      MENU_BUTTON_ART.continue,
      360,
      !hasSave,
      () => this.showSlots("continue"),
    );
    this.artButton(screen, VIEW.width / 2, 505, MENU_BUTTON_ART.wiki, 360, false, () =>
      this.showWikiCategories(),
    );
    this.artButton(screen, VIEW.width / 2, 620, MENU_BUTTON_ART.exit, 270, false, () =>
      this.showExitScreen(),
    );

    screen.setAlpha(0);
    this.tweens.add({ targets: screen, alpha: 1, duration: 220 });
  }

  private showSlots(mode: SlotMode): void {
    this.escapeAction = () => this.showMainMenu();
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
    this.escapeAction = () => this.showSlots(mode);
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
      165,
      MENU_BUTTON_ART.level1,
      310,
      false,
      () => this.startLevel(mode, slotIndex, 1),
      completed ? "GREEN VALLEY · COMPLETED" : "GREEN VALLEY",
    );

    const level2Unlocked = mode === "continue" && (save?.unlockedLevel ?? 1) >= 2;
    const level2Completed = mode === "continue" && save?.completedLevels.includes(2);
    this.artButton(
      screen,
      VIEW.width / 2,
      260,
      MENU_BUTTON_ART.level2,
      310,
      !level2Unlocked,
      () => this.startLevel(mode, slotIndex, 2),
      level2Completed
        ? "FORKED PASS · COMPLETED"
        : level2Unlocked
          ? "FORKED PASS"
          : "COMPLETE LEVEL 1 TO UNLOCK",
    );

    const level3Unlocked = mode === "continue" && (save?.unlockedLevel ?? 1) >= 3;
    const level3Completed = mode === "continue" && save?.completedLevels.includes(3);
    this.artButton(
      screen,
      VIEW.width / 2,
      355,
      MENU_BUTTON_ART.level3,
      310,
      !level3Unlocked,
      () => this.startLevel(mode, slotIndex, 3),
      level3Completed
        ? "CROSSED ROADS · COMPLETED"
        : level3Unlocked
          ? "CROSSED ROADS"
          : "COMPLETE LEVEL 2 TO UNLOCK",
    );

    const level4Unlocked = mode === "continue" && (save?.unlockedLevel ?? 1) >= 4;
    const level4Completed = mode === "continue" && save?.completedLevels.includes(4);
    this.artButton(
      screen,
      VIEW.width / 2,
      450,
      MENU_BUTTON_ART.level4,
      310,
      !level4Unlocked,
      () => this.startLevel(mode, slotIndex, 4),
      level4Completed
        ? "ELVEN AMBUSH · COMPLETED"
        : level4Unlocked
          ? "ELVEN AMBUSH"
          : "COMPLETE LEVEL 3 TO UNLOCK",
    );

    const level5Unlocked = mode === "continue" && (save?.unlockedLevel ?? 1) >= 5;
    const level5Completed = mode === "continue" && save?.completedLevels.includes(5);
    this.artButton(
      screen,
      VIEW.width / 2,
      545,
      MENU_BUTTON_ART.level5,
      310,
      !level5Unlocked,
      () => this.startLevel(mode, slotIndex, 5),
      level5Completed
        ? "IRONWORKS PASS · COMPLETED"
        : level5Unlocked
          ? "IRONWORKS PASS"
          : "COMPLETE LEVEL 4 TO UNLOCK",
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

  /** Wooden folder row used by both category and entry lists. */
  private wikiFolderButton(
    container: Phaser.GameObjects.Container,
    y: number,
    label: string,
    onPress: () => void,
  ): void {
    const wood = this.add.graphics();
    wood.fillStyle(hex(C.outline), 0.96).fillRoundedRect(-276, -46, 552, 92, 19);
    wood.fillStyle(hex(C.woodDark), 1).fillRoundedRect(-268, -39, 536, 78, 14);
    wood.lineStyle(3, hex(C.goldDark), 1).strokeRoundedRect(-264, -35, 528, 70, 12);

    // A simple folder tab reads clearly at phone scale and avoids relying on an emoji font.
    wood.fillStyle(hex(C.goldDark), 1).fillRoundedRect(-226, -15, 48, 34, 5);
    wood.fillRoundedRect(-220, -23, 25, 12, 4);
    wood.lineStyle(2, hex(C.outline), 1).strokeRoundedRect(-226, -15, 48, 34, 5);

    const text = this.add
      .text(-150, 1, label, {
        fontFamily: MENU_FONT,
        fontSize: "27px",
        color: C.parchment,
        stroke: C.outline,
        strokeThickness: 6,
      })
      .setOrigin(0, 0.5);
    const arrow = this.add
      .text(226, 0, ">", {
        fontFamily: MENU_FONT,
        fontSize: "31px",
        color: C.gold,
        stroke: C.outline,
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    const row = this.add.container(VIEW.width / 2, y, [wood, text, arrow]);
    container.add(row);

    const hitArea = this.add.zone(0, 0, 552, 92).setInteractive({ useHandCursor: true });
    row.add(hitArea);
    hitArea.on("pointerover", () => wood.setAlpha(0.88));
    hitArea.on("pointerout", () => wood.setAlpha(1));
    hitArea.on("pointerdown", () => {
      this.sound.play(UI_CLICK.key, { volume: 0.24 });
      this.tweens.add({ targets: row, scale: 0.96, duration: 60, yoyo: true, onComplete: onPress });
    });
  }

  private showWikiCategories(): void {
    this.escapeAction = () => this.showMainMenu();
    const screen = this.replaceScreen();
    this.title(screen, "WIKI", "Choose a folder");
    const categories: WikiCategoryKey[] = ["towers", "supply", "enemies"];
    categories.forEach((key, index) => {
      this.wikiFolderButton(screen, 285 + index * 115, WIKI_CATEGORIES[key].title, () =>
        this.showWikiCategory(key),
      );
    });
    this.backButton(screen, () => this.showMainMenu());
  }

  private showWikiCategory(categoryKey: WikiCategoryKey): void {
    this.escapeAction = () => this.showWikiCategories();
    const screen = this.replaceScreen();
    const category = WIKI_CATEGORIES[categoryKey];
    this.title(screen, category.title, "Choose an entry");
    category.entries.forEach((entry, index) => {
      const spacing = category.entries.length > 3 ? 86 : category.entries.length > 2 ? 108 : 130;
      const start = category.entries.length > 3 ? 260 : 295;
      this.wikiFolderButton(screen, start + index * spacing, entry.title, () =>
        this.showWikiEntry(categoryKey, entry),
      );
    });
    this.backButton(screen, () => this.showWikiCategories());
  }

  private showWikiEntry(categoryKey: WikiCategoryKey, entry: WikiEntry): void {
    this.escapeAction = () => this.showWikiCategory(categoryKey);
    const screen = this.replaceScreen();
    this.title(screen, entry.title, WIKI_CATEGORIES[categoryKey].title);

    const panel = this.add.graphics();
    panel.fillStyle(hex(C.outline), 0.96).fillRoundedRect(235, 235, 810, 350, 26);
    panel.fillStyle(hex(C.panel), 0.97).fillRoundedRect(247, 247, 786, 326, 20);
    panel.lineStyle(4, hex(C.goldDark), 1).strokeRoundedRect(253, 253, 774, 314, 17);
    screen.add(panel);

    const art = this.wikiPicture(entry.picture);
    art.setPosition(410, 410);
    screen.add(art);

    screen.add(
      this.add
        .text(610, 315, entry.title, {
          fontFamily: MENU_FONT,
          fontSize: "35px",
          color: C.gold,
          stroke: C.outline,
          strokeThickness: 7,
        })
        .setOrigin(0, 0.5),
    );
    screen.add(
      this.add.text(610, 375, entry.description, {
        fontFamily: MENU_FONT,
        fontSize: "20px",
        color: C.parchment,
        stroke: C.outline,
        strokeThickness: 4,
        wordWrap: { width: 360, useAdvancedWrap: true },
        lineSpacing: 8,
      }),
    );
    this.backButton(screen, () => this.showWikiCategory(categoryKey));
  }

  private wikiPicture(picture: WikiPicture): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = [];
    let image: Phaser.GameObjects.Image;

    if (picture === "archer") image = this.add.image(0, 0, "wiki-archer", "walk_4");
    else if (picture === "archer-2") image = this.add.image(0, 0, "wiki-archer-2", "walk_4");
    else if (picture === "bomber") image = this.add.image(0, 0, "wiki-bomber");
    else if (picture === "bomber-2") image = this.add.image(0, 0, "wiki-bomber-2");
    else if (picture === "goblin") {
      image = this.add.image(0, 0, "wiki-goblin", "walk_1");
    } else if (picture === "fire-goblin") image = this.add.image(0, 0, "wiki-fire-goblin");
    else if (picture === "airship") image = this.add.image(0, 0, "wiki-airship");
    else if (picture === "elf") image = this.add.image(0, 0, "wiki-elf", "walk_1");
    else if (picture === "peasant") image = this.add.image(0, 0, "wiki-peasant", "walk_1");
    else image = this.add.image(0, 0, "wiki-grunt", "walk_1");

    image.setScale(Math.min(1.55, 190 / image.height));
    objects.unshift(image);
    return this.add.container(0, 0, objects);
  }

  private showExitScreen(): void {
    this.escapeAction = () => this.showMainMenu();
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
