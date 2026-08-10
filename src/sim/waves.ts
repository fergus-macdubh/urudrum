import type { EnemyKind } from "./config";

export interface WaveGroup {
  kind: EnemyKind;
  count: number;
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
  { startTime: 3, groups: [{ kind: "grunt", count: 4, gap: 1.0 }] },
  { startTime: 12, groups: [{ kind: "grunt", count: 6, gap: 0.8 }] },
  {
    startTime: 21,
    groups: [
      { kind: "grunt", count: 7, gap: 0.7 },
      { kind: "brute", count: 1, gap: 1.2 },
    ],
  },
  {
    startTime: 30,
    groups: [
      { kind: "grunt", count: 8, gap: 0.65 },
      { kind: "brute", count: 1, gap: 1.2 },
    ],
  },
  {
    startTime: 39,
    groups: [
      { kind: "grunt", count: 8, gap: 0.6 },
      { kind: "brute", count: 3, gap: 1.2 },
    ],
  },
];

export interface ScheduledSpawn {
  time: number;
  kind: EnemyKind;
  wave: number;
}

/** Flattens the wave table into a flat, time-sorted spawn list the world can just walk. */
export function buildSpawnSchedule(waves: Wave[] = WAVES): ScheduledSpawn[] {
  const schedule: ScheduledSpawn[] = [];

  waves.forEach((wave, waveIndex) => {
    let offset = 0;
    for (const group of wave.groups) {
      for (let i = 0; i < group.count; i++) {
        schedule.push({ time: wave.startTime + offset, kind: group.kind, wave: waveIndex });
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
