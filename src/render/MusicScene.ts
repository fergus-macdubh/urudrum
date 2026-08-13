import Phaser from "phaser";
import { loadAudioSettings, MUSIC_TRACKS, onAudioSettingsChanged } from "../audio";

type VolumeSound = Phaser.Sound.BaseSound & { volume: number; setVolume(value: number): VolumeSound };

/** Persistent soundtrack scene. It survives Menu/Game transitions and alternates two loops. */
export class MusicScene extends Phaser.Scene {
  private current?: VolumeSound;
  private trackIndex = 0;
  private removeSettingsListener?: () => void;

  constructor() {
    super("Music");
  }

  preload(): void {
    for (const track of MUSIC_TRACKS) {
      if (!this.cache.audio.exists(track.key)) this.load.audio(track.key, track.url);
    }
  }

  create(): void {
    this.removeSettingsListener?.();
    this.removeSettingsListener = onAudioSettingsChanged((settings) => {
      this.current?.setVolume(settings.music);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeSettingsListener?.());

    this.beginPlayback();
    if (this.sound.locked) this.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.beginPlayback());
  }

  /** Called from MenuScene on every user gesture as a reliable mobile autoplay fallback. */
  beginPlayback(): void {
    if (!this.current) this.playTrack(0);
    else if (!this.current.isPlaying && !this.current.isPaused) this.current.play();
  }

  private playTrack(index: number): void {
    this.trackIndex = index;
    const volume = loadAudioSettings().music;
    this.current = this.sound.add(MUSIC_TRACKS[index]!.key, { volume }) as VolumeSound;
    this.current.once(Phaser.Sound.Events.COMPLETE, () => this.playNextTrack());
    this.current.play();
  }

  private playNextTrack(): void {
    this.current?.destroy();
    this.current = undefined;
    const nextIndex = (this.trackIndex + 1) % MUSIC_TRACKS.length;
    this.playTrack(nextIndex);
  }
}
