export interface AudioSettings {
  music: number;
  effects: number;
}

export const MUSIC_TRACKS = [
  { key: "music-battle-1", url: "audio/bg-music-1.mp3" },
  { key: "music-battle-2", url: "audio/bg-music-2.mp3" },
] as const;

const AUDIO_SETTINGS_KEY = "urudrum-audio-settings";
const DEFAULT_AUDIO_SETTINGS: AudioSettings = { music: 0.5, effects: 0.8 };
const SETTINGS_EVENT = "urudrum-audio-settings-changed";

function clampVolume(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

export function loadAudioSettings(): AudioSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY) ?? "null") as
      | Partial<AudioSettings>
      | null;
    return {
      music: clampVolume(parsed?.music, DEFAULT_AUDIO_SETTINGS.music),
      effects: clampVolume(parsed?.effects, DEFAULT_AUDIO_SETTINGS.effects),
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(settings: AudioSettings): AudioSettings {
  const normalized = {
    music: clampVolume(settings.music, DEFAULT_AUDIO_SETTINGS.music),
    effects: clampVolume(settings.effects, DEFAULT_AUDIO_SETTINGS.effects),
  };
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(normalized));
  } catch {
    // Audio remains adjustable for this session when persistence is unavailable.
  }
  window.dispatchEvent(new CustomEvent<AudioSettings>(SETTINGS_EVENT, { detail: normalized }));
  return normalized;
}

export function effectsVolume(baseVolume: number): number {
  return baseVolume * loadAudioSettings().effects;
}

export function onAudioSettingsChanged(listener: (settings: AudioSettings) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<AudioSettings>).detail);
  window.addEventListener(SETTINGS_EVENT, handler);
  return () => window.removeEventListener(SETTINGS_EVENT, handler);
}
