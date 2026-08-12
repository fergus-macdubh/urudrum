import type Phaser from "phaser";
import { ECONOMY, ENEMIES, SUPPLY, TOWER } from "../sim/config";
import { WAVES } from "../sim/waves";
import type { GameScene } from "../render/GameScene";
import type { World } from "../sim/world";

/**
 * Development-only console harness. Excluded from production builds by the
 * `import.meta.env.DEV` guard at the call site, so none of this ships.
 *
 * It exists because the game is verified by driving it, not by reading it:
 *
 *   pump(120)                 advance 120 frames by hand (works with the tab hidden)
 *   play([0,"p",1], 40)       buy pad 0, a porter, then pad 1; run to t=40s
 *   sweep([[0,1],[0,"p",1]])  headless balance runs, no rendering
 *   shoot('name')             PNG to tools/shots/ via `node tools/snapsink.mjs`
 *   balance.ENEMIES.peasant.hp  live-tune, picked up by the next new World()
 */
export function installDevHarness(game: Phaser.Game): void {
  let clock = performance.now();

  const scene = () => game.scene.getScene("Game") as GameScene;

  /**
   * Step the loop manually — a hidden tab never fires requestAnimationFrame.
   *
   * Calling `game.step()` directly bypasses TimeStep, whose `delta`/`time`/`now` fields the
   * tween and clock systems read. Leave them at zero and the simulation advances while every
   * tween sits frozen, which silently makes captures a lie: fades never resolve, one-shot
   * effects never clean up. Write them before each step.
   */
  const pump = (frames: number, dt = 1000 / 60) => {
    const loop = game.loop as unknown as { time: number; delta: number; now: number };
    for (let i = 0; i < frames; i++) {
      clock += dt;
      loop.time = clock;
      loop.now = clock;
      loop.delta = dt;
      game.step(clock, dt);
    }
  };

  /**
   * A shopping list, bought in order as gold allows. A number is a build pad; `"p"` hires a
   * porter — so `[0, "p", 1]` means "pad 0, then a porter, then pad 1".
   */
  type Buy = number | "p";

  const attempt = (w: World, item: Buy): boolean =>
    item === "p" ? w.tryHirePorter() : w.tryBuild(item);

  /** Work through the list as gold allows, then run until `untilSeconds`. */
  const play = (order: Buy[], untilSeconds = 90) => {
    const w = scene().world;
    let next = 0;
    while (w.elapsed < untilSeconds && w.status === "playing") {
      pump(1);
      if (next < order.length && attempt(w, order[next]!)) next++;
    }
    return {
      status: w.status,
      t: +w.elapsed.toFixed(1),
      gold: w.gold,
      lives: w.lives,
      towers: w.towers.length,
      porters: w.porters.length,
    };
  };

  /** Headless balance runs: no rendering, so hundreds of games take milliseconds. */
  const sweep = (orders: Buy[][]) => {
    const Ctor = Object.getPrototypeOf(scene().world).constructor as new () => World;
    return orders.map((order) => {
      const w = new Ctor();
      let next = 0;
      for (let i = 0; i < 9000 && w.status === "playing"; i++) {
        w.update(1 / 60);
        if (next < order.length && attempt(w, order[next]!)) next++;
        w.events.length = 0; // nothing drains events headlessly
      }
      return `[${order}] ${w.status} t=${w.elapsed.toFixed(0)}s lives=${w.lives} unspent=${w.gold} towers=${w.towers.length} porters=${w.porters.length}`;
    });
  };

  /** Capture the canvas straight to disk via tools/snapsink.mjs. */
  const shoot = (name: string) =>
    new Promise((resolve) => {
      game.renderer.snapshot((image) => {
        const canvas = document.createElement("canvas");
        canvas.width = game.canvas.width;
        canvas.height = game.canvas.height;
        canvas.getContext("2d")!.drawImage(image as HTMLImageElement, 0, 0);
        fetch(`http://localhost:5199/?name=${name}`, { method: "POST", body: canvas.toDataURL("image/png") })
          .then((r) => resolve(`ok ${r.status}`))
          .catch((e) => resolve(`ERR ${e} — is snapsink running?`));
      });
      pump(1);
    });

  Object.assign(globalThis, {
    game,
    pump,
    play,
    sweep,
    shoot,
    balance: { ENEMIES, TOWER, ECONOMY, SUPPLY, WAVES },
  });
}
