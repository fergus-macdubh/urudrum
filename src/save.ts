export const SAVE_SLOT_COUNT = 3;
export const LEVEL_COUNT = 1;

const SAVE_KEY = "urudrum-save-slots";
const LEGACY_SAVE_KEY = "bastion-save-slots";

export interface SaveSlot {
  version: 1;
  createdAt: number;
  updatedAt: number;
  lastLevel: number;
  unlockedLevel: number;
  completedLevels: number[];
}

function emptySlots(): Array<SaveSlot | null> {
  return Array.from({ length: SAVE_SLOT_COUNT }, () => null);
}

export function loadSaveSlots(): Array<SaveSlot | null> {
  try {
    // Preserve prototype saves created before the game received its final name.
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return emptySlots();

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return emptySlots();

    return emptySlots().map((_, index) => {
      const candidate = parsed[index] as Partial<SaveSlot> | null | undefined;
      if (!candidate || candidate.version !== 1) return null;

      return {
        version: 1,
        createdAt: Number(candidate.createdAt) || Date.now(),
        updatedAt: Number(candidate.updatedAt) || Date.now(),
        lastLevel: Math.min(LEVEL_COUNT, Math.max(1, Number(candidate.lastLevel) || 1)),
        unlockedLevel: Math.min(LEVEL_COUNT, Math.max(1, Number(candidate.unlockedLevel) || 1)),
        completedLevels: Array.isArray(candidate.completedLevels)
          ? candidate.completedLevels.filter(
              (level): level is number =>
                Number.isInteger(level) && level >= 1 && level <= LEVEL_COUNT,
            )
          : [],
      };
    });
  } catch {
    return emptySlots();
  }
}

function storeSaveSlots(slots: Array<SaveSlot | null>): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(slots));
  } catch {
    // A private browser window can reject localStorage. The game remains playable for the
    // current session even when persistence is unavailable.
  }
}

export function createSave(slotIndex: number): SaveSlot {
  const now = Date.now();
  const save: SaveSlot = {
    version: 1,
    createdAt: now,
    updatedAt: now,
    lastLevel: 1,
    unlockedLevel: 1,
    completedLevels: [],
  };

  const slots = loadSaveSlots();
  slots[slotIndex] = save;
  storeSaveSlots(slots);
  return save;
}

export function markLevelStarted(slotIndex: number, level: number): void {
  const slots = loadSaveSlots();
  const save = slots[slotIndex];
  if (!save) return;

  save.lastLevel = Math.min(LEVEL_COUNT, Math.max(1, level));
  save.updatedAt = Date.now();
  storeSaveSlots(slots);
}

export function markLevelCompleted(slotIndex: number, level: number): void {
  const slots = loadSaveSlots();
  const save = slots[slotIndex];
  if (!save) return;

  if (!save.completedLevels.includes(level)) save.completedLevels.push(level);
  save.completedLevels.sort((a, b) => a - b);
  save.lastLevel = Math.min(LEVEL_COUNT, Math.max(1, level));
  save.unlockedLevel = Math.min(LEVEL_COUNT, Math.max(save.unlockedLevel, level + 1));
  save.updatedAt = Date.now();
  storeSaveSlots(slots);
}
