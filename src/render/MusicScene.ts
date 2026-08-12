import Phaser from "phaser";
import { loadAudioSettings, MUSIC_TRACKS, onAudioSettingsChanged } from "../audio";

const CROSSFADE_SECONDS = 3;
type VolumeSound = Phaser.Sound.BaseSound & { volume: number; setVolume(value: number): VolumeSound };

/** Persistent soundtrack scene. It survives Menu/Game transitions and alternates two loops. */
export class MusicScene extends Phaser.Scene {
  private current?: VolumeSound;
  private next?: VolumeSound;
  private trackIndex = 0;
  private transition?: Phaser.Time.TimerEvent;
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
      if (this.next) this.next.setVolume(settings.music);
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
    this.current.play();
    this.scheduleCrossfade(this.current);
  }

  private scheduleCrossfade(sound: VolumeSound): void {
    this.transition?.remove(false);
    const waitMs = Math.max(1000, (sound.duration - CROSSFADE_SECONDS) * 1000);
    this.transition = this.time.delayedCall(waitMs, () => this.crossfade());
  }

  private crossfade(): void {
    const outgoing = this.current;
    if (!outgoing) return;

    const nextIndex = (this.trackIndex + 1) % MUSIC_TRACKS.length;
    const targetVolume = loadAudioSettings().music;
    const incoming = this.sound.add(MUSIC_TRACKS[nextIndex]!.key, { volume: 0 }) as VolumeSound;
    this.next = incoming;
    incoming.play();

    this.tweens.add({
      targets: outgoing,
      volume: 0,
      duration: CROSSFADE_SECONDS * 1000,
      ease: "Sine.easeInOut",
      onComplete: () => outgoing.destroy(),
    });
    this.tweens.add({
      targets: incoming,
      volume: targetVolume,
      duration: CROSSFADE_SECONDS * 1000,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.current = incoming;
        this.next = undefined;
        this.trackIndex = nextIndex;
        this.scheduleCrossfade(incoming);
      },
    });
  }
}
