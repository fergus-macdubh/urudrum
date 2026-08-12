import Phaser from "phaser";
import { VIEW } from "./sim/config";
import { GameScene } from "./render/GameScene";
import { HudScene } from "./render/HudScene";
import { MenuScene } from "./render/MenuScene";
import { MusicScene } from "./render/MusicScene";
import { C, hex } from "./render/palette";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: VIEW.width,
  height: VIEW.height,
  backgroundColor: hex(C.sky),
  scale: {
    // FIT letterboxes to any phone aspect ratio while the game keeps designing to 1280x720.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: false,
  },
  // Only the menu auto-starts. It launches Game after a save slot and level are selected;
  // Game then launches Hud above the board.
  scene: [MenuScene, MusicScene, GameScene, HudScene],
});

// Console harness for driving and inspecting the game. Dropped from production builds.
if (import.meta.env.DEV) {
  void import("./dev/harness").then((m) => m.installDevHarness(game));

  // Direct level links keep visual iteration fast without weakening the save progression
  // in production: http://localhost:5173/?level=4 opens the requested board immediately.
  const requestedLevel = Number(new URLSearchParams(location.search).get("level"));
  if (Number.isInteger(requestedLevel) && requestedLevel >= 1) {
    game.events.once(Phaser.Core.Events.READY, () => {
      game.scene.start("Game", { saveSlot: 0, level: requestedLevel });
    });
  }
}
