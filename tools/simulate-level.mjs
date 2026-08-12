import { createServer } from "vite";

const level = Number(process.argv[2] ?? 4);
const runsPerPolicy = Number(process.argv[3] ?? 30);
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const { World } = await vite.ssrLoadModule("/src/sim/world.ts");

const policies = [
  { name: "archer rush", pattern: ["archer"], hires: [], openingTowers: 0 },
  { name: "bomb rush", pattern: ["bomb"], hires: [], openingTowers: 0 },
  { name: "mixed towers", pattern: ["archer", "bomb"], hires: [], openingTowers: 0 },
  { name: "ground logistics", pattern: ["archer", "bomb"], hires: ["normal"], openingTowers: 2 },
  { name: "fire logistics", pattern: ["archer", "bomb"], hires: ["incendiary"], openingTowers: 2 },
  { name: "safe logistics", pattern: ["archer", "bomb"], hires: ["airship"], openingTowers: 3 },
  {
    name: "planned mixed",
    pattern: ["archer", "bomb"],
    hires: [],
    openingTowers: 0,
    slots: [2, 6, 1, 5, 3, 7, 0, 4],
  },
  {
    name: "planned ground",
    pattern: ["archer", "bomb"],
    hires: ["normal"],
    openingTowers: 2,
    slots: [2, 6, 1, 5, 3, 7, 0, 4],
  },
  {
    name: "planned airship",
    pattern: ["archer", "bomb"],
    hires: ["airship"],
    openingTowers: 3,
    slots: [2, 6, 1, 5, 3, 7, 0, 4],
  },
  {
    name: "upgraded archers",
    pattern: ["archer"],
    hires: ["normal"],
    openingTowers: 1,
    upgrades: true,
    slots: [2, 3, 4, 6, 1, 7, 0, 5],
  },
  {
    name: "upgraded bombs",
    pattern: ["bomb"],
    hires: ["normal"],
    openingTowers: 1,
    upgrades: true,
    slots: [4, 3, 6, 2, 7, 1, 5, 0],
  },
  {
    name: "planned upgrades",
    pattern: ["archer", "bomb"],
    hires: ["normal", "airship"],
    openingTowers: 2,
    upgrades: true,
    slots: [2, 4, 3, 6, 1, 7, 0, 5],
  },
];

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function shuffledSlots(count, seed) {
  const slots = Array.from({ length: count }, (_, index) => index);
  const next = random(seed);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

function tryHire(world, kind) {
  if (kind === "airship") return world.tryHireAirshipPorter();
  if (kind === "incendiary") return world.tryHireIncendiaryPorter();
  return world.tryHirePorter();
}

function simulate(policy, run) {
  const world = new World(level);
  const slots = policy.slots ?? shuffledSlots(world.slots.length, 0x9e3779b9 ^ run ^ policy.name.length);
  let nextSlot = 0;
  let nextHire = 0;
  let decisionAt = 0;
  let porterAttacks = 0;
  let dryEvents = 0;
  let shots = 0;

  while (world.status === "playing" && world.elapsed < 120) {
    if (world.elapsed >= decisionAt) {
      decisionAt += 0.5;

      // Logistics openings place one tower first, then buy their specialist. This avoids
      // scoring the intentionally safe airship strategy as though the player ignored wave 1.
      if (nextSlot < policy.openingTowers) {
        const kind = policy.pattern[nextSlot % policy.pattern.length];
        if (world.tryBuild(slots[nextSlot], kind)) nextSlot++;
      } else if (nextHire < policy.hires.length) {
        if (tryHire(world, policy.hires[nextHire])) nextHire++;
      } else if (policy.upgrades) {
        const upgradeTarget = world.towers.find((tower) => tower.level === 1);
        if (upgradeTarget && world.tryUpgrade(upgradeTarget.slotIndex)) {
          // Spend the next decision on the following tower; if no upgrade is affordable,
          // fall through and keep expanding rather than freezing the build order.
        } else if (nextSlot < Math.min(7, slots.length)) {
          const kind = policy.pattern[nextSlot % policy.pattern.length];
          if (world.tryBuild(slots[nextSlot], kind)) nextSlot++;
        }
      } else if (nextSlot < Math.min(7, slots.length)) {
        const kind = policy.pattern[nextSlot % policy.pattern.length];
        if (world.tryBuild(slots[nextSlot], kind)) nextSlot++;
      }
    }

    world.update(1 / 30);
    for (const event of world.events) {
      if (event.type === "porterAttacked") porterAttacks++;
      if (event.type === "dry") dryEvents++;
      if (event.type === "fire") shots++;
    }
    world.events.length = 0;
  }

  return {
    won: world.status === "won",
    lives: world.lives,
    gold: world.gold,
    elapsed: world.elapsed,
    towers: world.towers.length,
      porters: world.porters.length,
      upgrades: world.towers.filter((tower) => tower.level === 2).length,
    porterAttacks,
    dryEvents,
    shots,
  };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

try {
  const rows = policies.map((policy) => {
    const results = Array.from({ length: runsPerPolicy }, (_, run) => simulate(policy, run));
    return {
      policy: policy.name,
      wins: `${results.filter((result) => result.won).length}/${results.length}`,
      winRate: `${Math.round(mean(results.map((result) => Number(result.won))) * 100)}%`,
      lives: mean(results.map((result) => result.lives)).toFixed(1),
      attacks: mean(results.map((result) => result.porterAttacks)).toFixed(1),
      dry: mean(results.map((result) => result.dryEvents)).toFixed(1),
      shots: Math.round(mean(results.map((result) => result.shots))),
      upgrades: mean(results.map((result) => result.upgrades)).toFixed(1),
    };
  });
  console.table(rows);
} finally {
  await vite.close();
}
