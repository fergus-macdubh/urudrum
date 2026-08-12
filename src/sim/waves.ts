import type { EnemyKind } from "./config";

export interface WaveGroup {
  kind: EnemyKind;
  count: number;
  /** Optional authored entrance. Omitted groups alternate between all level paths. */
  route?: number;
  /** Seconds between spawns inside this group. */
  gap: number;
}

export interface Wave {
  /** Seconds from the start of the session. */
  startTime: number;
  groups: WaveGroup[];
}

/**
 * Five waves on a 9-second cadence, which puts a full run at 60-68s.
 *
 * The spacing is what makes "bank the gold or build now?" land roughly every nine seconds.
 * Stretching it to a 11s cadence pushed the median run to 76s without changing the win rate
 * at all — pure dead time, so it was pulled back in.
 */
export const WAVES: Wave[] = [
  { startTime: 3, groups: [{ kind: "peasant", count: 4, gap: 1.0 }] },
  { startTime: 12, groups: [{ kind: "peasant", count: 6, gap: 0.8 }] },
  {
    startTime: 21,
    groups: [
      { kind: "peasant", count: 7, gap: 0.7 },
      { kind: "grunt", count: 1, gap: 1.2 },
    ],
  },
  {
    startTime: 30,
    groups: [
      { kind: "peasant", count: 8, gap: 0.65 },
      { kind: "grunt", count: 1, gap: 1.2 },
    ],
  },
  {
    startTime: 39,
    groups: [
      { kind: "peasant", count: 8, gap: 0.6 },
      { kind: "grunt", count: 3, gap: 1.2 },
    ],
  },
];

export const LEVEL_2_WAVES: Wave[] = [
  { startTime: 3, groups: [{ kind: "peasant", count: 6, gap: 0.85 }] },
  { startTime: 12, groups: [{ kind: "peasant", count: 9, gap: 0.62 }] },
  {
    startTime: 21,
    groups: [
      { kind: "peasant", count: 8, gap: 0.55 },
      { kind: "grunt", count: 2, gap: 1.0 },
    ],
  },
  {
    startTime: 30,
    groups: [
      { kind: "peasant", count: 12, gap: 0.48 },
      { kind: "grunt", count: 2, gap: 0.9 },
    ],
  },
  {
    startTime: 39,
    groups: [
      { kind: "peasant", count: 14, gap: 0.42 },
      { kind: "grunt", count: 4, gap: 0.85 },
    ],
  },
];

export const LEVEL_3_WAVES: Wave[] = [
  { startTime: 3, groups: [{ kind: "peasant", count: 5, gap: 0.9 }] },
  { startTime: 12, groups: [{ kind: "peasant", count: 7, gap: 0.7 }] },
  {
    startTime: 21,
    groups: [
      { kind: "peasant", count: 7, gap: 0.62 },
      { kind: "grunt", count: 1, gap: 1.0 },
    ],
  },
  {
    startTime: 30,
    groups: [
      { kind: "peasant", count: 10, gap: 0.54 },
      { kind: "grunt", count: 2, gap: 0.9 },
    ],
  },
  {
    startTime: 39,
    groups: [
      { kind: "peasant", count: 12, gap: 0.48 },
      { kind: "grunt", count: 3, gap: 0.84 },
    ],
  },
];

export const LEVEL_4_WAVES: Wave[] = [
  {
    startTime: 3,
    groups: [{ kind: "elf", count: 1, gap: 0.75 }, { kind: "peasant", count: 6, gap: 0.82 }],
  },
  {
    startTime: 12,
    groups: [
      { kind: "elf", count: 1, gap: 0.72 }, { kind: "peasant", count: 4, gap: 0.58 },
      { kind: "elf", count: 1, gap: 0.72 }, { kind: "peasant", count: 4, gap: 0.56 },
    ],
  },
  {
    startTime: 21,
    groups: [
      { kind: "elf", count: 1, gap: 0.7 }, { kind: "grunt", count: 2, gap: 0.86 },
      { kind: "peasant", count: 3, gap: 0.52 }, { kind: "elf", count: 1, gap: 0.7 },
      { kind: "peasant", count: 4, gap: 0.5 },
    ],
  },
  {
    startTime: 30,
    groups: [
      { kind: "elf", count: 1, gap: 0.68 }, { kind: "peasant", count: 5, gap: 0.47 },
      { kind: "elf", count: 1, gap: 0.68 }, { kind: "grunt", count: 2, gap: 0.82 },
      { kind: "peasant", count: 5, gap: 0.45 },
    ],
  },
  {
    startTime: 39,
    groups: [
      { kind: "elf", count: 1, gap: 0.65 }, { kind: "grunt", count: 2, gap: 0.75 },
      { kind: "elf", count: 1, gap: 0.65 }, { kind: "peasant", count: 5, gap: 0.42 },
      { kind: "elf", count: 1, gap: 0.65 }, { kind: "grunt", count: 2, gap: 0.72 },
      { kind: "peasant", count: 5, gap: 0.4 },
    ],
  },
];

export const LEVEL_5_WAVES: Wave[] = [
  {
    startTime: 3,
    groups: [
      { kind: "peasant", count: 8, gap: 0.66 },
      { kind: "grunt", count: 2, gap: 0.9 },
    ],
  },
  {
    startTime: 12,
    groups: [
      { kind: "elf", count: 1, gap: 0.7 },
      { kind: "peasant", count: 10, gap: 0.52 },
      { kind: "grunt", count: 3, gap: 0.8 },
    ],
  },
  {
    startTime: 21,
    groups: [
      { kind: "grunt", count: 4, gap: 0.74 },
      { kind: "peasant", count: 11, gap: 0.46 },
      { kind: "elf", count: 1, gap: 0.68 },
    ],
  },
  {
    startTime: 30,
    groups: [
      { kind: "elf", count: 1, gap: 0.64 },
      { kind: "peasant", count: 13, gap: 0.4 },
      { kind: "grunt", count: 5, gap: 0.68 },
      { kind: "elf", count: 1, gap: 0.64 },
    ],
  },
  {
    startTime: 39,
    groups: [
      { kind: "grunt", count: 4, gap: 0.62 },
      { kind: "elf", count: 1, gap: 0.6 },
      { kind: "peasant", count: 15, gap: 0.36 },
      { kind: "grunt", count: 4, gap: 0.6 },
      { kind: "elf", count: 1, gap: 0.6 },
    ],
  },
];

export function wavesForLevel(level: number): Wave[] {
  return level === 5
    ? LEVEL_5_WAVES
    : level === 4
      ? LEVEL_4_WAVES
      : level === 3
        ? LEVEL_3_WAVES
        : level === 2
          ? LEVEL_2_WAVES
          : WAVES;
}

export interface ScheduledSpawn {
  time: number;
  kind: EnemyKind;
  wave: number;
  route?: number;
}

/** Flattens the wave table into a flat, time-sorted spawn list the world can just walk. */
export function buildSpawnSchedule(waves: Wave[] = WAVES): ScheduledSpawn[] {
  const schedule: ScheduledSpawn[] = [];

  waves.forEach((wave, waveIndex) => {
    let offset = 0;
    for (const group of wave.groups) {
      for (let i = 0; i < group.count; i++) {
        schedule.push({
          time: wave.startTime + offset,
          kind: group.kind,
          wave: waveIndex,
          route: group.route,
        });
        offset += group.gap;
      }
    }
  });

  return schedule.sort((a, b) => a.time - b.time);
}

export function totalEnemyCount(waves: Wave[] = WAVES): number {
  return waves.reduce(
    (sum, wave) => sum + wave.groups.reduce((s, g) => s + g.count, 0),
    0,
  );
}
