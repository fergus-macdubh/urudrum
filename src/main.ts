import Phaser from "phaser";
import { VIEW } from "./sim/config";
import { GameScene } from "./render/GameScene";
import { HudScene } from "./render/HudScene";
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
  // Only the first scene auto-starts; GameScene launches Hud once it is up. Hud is listed
  // second so it renders above the board.
  scene: [GameScene, HudScene],
});

// Console harness for driving and inspecting the game. Dropped from production builds.
if (import.meta.env.DEV) {
  void import("./dev/harness").then((m) => m.installDevHarness(game));
}
