import clickUrl from "../../../../assets/sounds/ui-click.wav";
import closeUrl from "../../../../assets/sounds/ui-close.wav";
import errorUrl from "../../../../assets/sounds/ui-error.wav";
import notifyUrl from "../../../../assets/sounds/ui-notify.wav";
import openUrl from "../../../../assets/sounds/ui-open.wav";
import successUrl from "../../../../assets/sounds/ui-success.wav";

const MUSIC_TRACK_IMPORTS = import.meta.glob("../../../../assets/songs/*.{mp3,wav,ogg,m4a,aac,flac}", {
  eager: true,
  import: "default"
}) as Record<string, string>;

export type UiSoundId = "click" | "open" | "close" | "success" | "notify" | "error";

type UiSoundDirective = UiSoundId | "off";

interface UiSoundDefinition {
  url: string;
  volume: number;
  playbackRate?: number;
}

export interface MusicTrack {
  id: string;
  name: string;
  url: string;
}

export type MusicPlaybackMode = "single" | "cycle";

interface UiSoundPlayOptions {
  volume?: number;
  playbackRate?: number;
}

const UI_SOUND_STORAGE_KEY = "hexagonia:ui-sound-muted";
const MUSIC_TRACK_STORAGE_KEY = "hexagonia:music-track";
const MUSIC_PLAYBACK_STORAGE_KEY = "hexagonia:music-playback";
const MUSIC_MODE_STORAGE_KEY = "hexagonia:music-mode";
const MUSIC_VOLUME = 0.68;
const INTERACTIVE_SELECTOR = [
  "[data-ui-sound]",
  "button",
  "[role='button']",
  "a[href]",
  "summary",
  "select",
  "input[type='checkbox']",
  "input[type='radio']"
].join(", ");

const SOUND_LIBRARY: Record<UiSoundId, UiSoundDefinition> = {
  click: { url: clickUrl, volume: 0.72 },
  open: { url: openUrl, volume: 0.58 },
  close: { url: closeUrl, volume: 0.5 },
  success: { url: successUrl, volume: 0.64 },
  notify: { url: notifyUrl, volume: 0.56 },
  error: { url: errorUrl, volume: 0.52 }
};
const MUSIC_LIBRARY: MusicTrack[] = Object.entries(MUSIC_TRACK_IMPORTS)
  .map(([path, url]) => {
    const fileName = path.split("/").pop() ?? path;
    return {
      id: fileName,
      name: fileName.replace(/\.[^.]+$/, ""),
      url
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name, "de", { sensitivity: "base" }));

type AudioContextConstructor = typeof AudioContext;
type MusicStateListener = () => void;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const audioWindow = window as Window & {
    webkitAudioContext?: AudioContextConstructor;
  };

  return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function isDisabledElement(element: HTMLElement): boolean {
  if ("disabled" in element && typeof element.disabled === "boolean") {
    return element.disabled;
  }

  return element.getAttribute("aria-disabled") === "true";
}

function resolveInteractiveElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const element = target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
  if (!element || isDisabledElement(element)) {
    return null;
  }

  return element;
}

function readDirective(element: HTMLElement): UiSoundDirective | null {
  const value = element.dataset.uiSound;
  if (!value) {
    return null;
  }

  if (value === "off") {
    return "off";
  }

  if (value in SOUND_LIBRARY) {
    return value as UiSoundId;
  }

  return null;
}

function resolveMusicTrack(trackId: string | null): MusicTrack | null {
  if (!trackId) {
    return MUSIC_LIBRARY[0] ?? null;
  }

  return MUSIC_LIBRARY.find((track) => track.id === trackId) ?? MUSIC_LIBRARY[0] ?? null;
}

function resolveInitialMusicTrackId(): string | null {
  if (typeof window === "undefined") {
    return MUSIC_LIBRARY[0]?.id ?? null;
  }

  const stored = window.localStorage.getItem(MUSIC_TRACK_STORAGE_KEY);
  return resolveMusicTrack(stored)?.id ?? null;
}

function resolveInitialMusicPaused(): boolean {
  if (!MUSIC_LIBRARY.length) {
    return true;
  }

  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(MUSIC_PLAYBACK_STORAGE_KEY) !== "playing";
}

function resolveInitialMusicPlaybackMode(): MusicPlaybackMode {
  if (typeof window === "undefined") {
    return "single";
  }

  return window.localStorage.getItem(MUSIC_MODE_STORAGE_KEY) === "cycle" ? "cycle" : "single";
}

class UiSoundManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<UiSoundId, AudioBuffer>();
  private loading = new Map<UiSoundId, Promise<AudioBuffer | null>>();
  private musicStateListeners = new Set<MusicStateListener>();
  private musicElement: HTMLAudioElement | null = null;
  private currentMusicTrackId: string | null = null;
  private muted =
    typeof window !== "undefined" && window.localStorage.getItem(UI_SOUND_STORAGE_KEY) === "muted";
  private hasStoredMusicPlaybackPreference =
    typeof window !== "undefined" && window.localStorage.getItem(MUSIC_PLAYBACK_STORAGE_KEY) !== null;
  private selectedMusicTrackId = resolveInitialMusicTrackId();
  private musicPaused = resolveInitialMusicPaused();
  private musicPlaybackMode = resolveInitialMusicPlaybackMode();
  private musicResumePending = false;

  isMuted(): boolean {
    return this.muted;
  }

  getMusicTracks(): readonly MusicTrack[] {
    return MUSIC_LIBRARY;
  }

  getSelectedMusicTrackId(): string | null {
    return this.selectedMusicTrackId;
  }

  isMusicPaused(): boolean {
    return this.musicPaused;
  }

  getMusicPlaybackMode(): MusicPlaybackMode {
    return this.musicPlaybackMode;
  }

  subscribeToMusicState(listener: MusicStateListener): () => void {
    this.musicStateListeners.add(listener);
    return () => {
      this.musicStateListeners.delete(listener);
    };
  }

  setMuted(nextMuted: boolean): void {
    this.muted = nextMuted;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(UI_SOUND_STORAGE_KEY, nextMuted ? "muted" : "on");
    }

    if (this.masterGain) {
      this.masterGain.gain.value = nextMuted ? 0 : 1;
    }
  }

  prime(): void {
    if (!getAudioContextConstructor()) {
      return;
    }

    void Promise.all((Object.keys(SOUND_LIBRARY) as UiSoundId[]).map((soundId) => this.load(soundId)));
  }

  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (context && context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // Browsers may still block resume until a later gesture.
      }
    }

    if (
      !this.musicPaused &&
      (this.musicResumePending || this.musicElement?.paused || this.currentMusicTrackId !== this.selectedMusicTrackId)
    ) {
      await this.playSelectedMusic();
    }
  }

  async play(soundId: UiSoundId, options: UiSoundPlayOptions = {}): Promise<void> {
    if (this.muted) {
      return;
    }

    const context = this.ensureContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        return;
      }
    }

    const buffer = await this.load(soundId);
    if (!buffer || !this.masterGain) {
      return;
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    const definition = SOUND_LIBRARY[soundId];

    source.buffer = buffer;
    source.playbackRate.value = options.playbackRate ?? definition.playbackRate ?? 1;
    gain.gain.value = Math.max(0, Math.min(1.5, definition.volume * (options.volume ?? 1)));

    source.connect(gain);
    gain.connect(this.masterGain);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(0);
  }

  async setMusicTrack(trackId: string): Promise<void> {
    const track = resolveMusicTrack(trackId);
    if (!track) {
      return;
    }

    this.selectedMusicTrackId = track.id;
    this.persistMusicTrack();
    this.musicPaused = false;
    this.persistMusicPlaybackState();
    this.musicResumePending = true;
    this.notifyMusicStateListeners();
    await this.playSelectedMusic();
  }

  async setMusicPaused(nextPaused: boolean): Promise<boolean> {
    if (!resolveMusicTrack(this.selectedMusicTrackId)) {
      this.musicPaused = true;
      this.persistMusicPlaybackState();
      return this.musicPaused;
    }

    this.musicPaused = nextPaused;
    this.persistMusicPlaybackState();
    if (nextPaused) {
      this.musicResumePending = false;
      this.musicElement?.pause();
      this.notifyMusicStateListeners();
      return this.musicPaused;
    }

    this.musicResumePending = true;
    this.notifyMusicStateListeners();
    await this.playSelectedMusic();
    return this.musicPaused;
  }

  async toggleMusicPaused(): Promise<boolean> {
    return this.setMusicPaused(!this.musicPaused);
  }

  async setMusicPlaybackMode(nextMode: MusicPlaybackMode): Promise<void> {
    this.musicPlaybackMode = nextMode;
    this.persistMusicPlaybackMode();
    this.updateMusicElementLoop();
    this.notifyMusicStateListeners();

    if (!this.musicPaused) {
      await this.playSelectedMusic();
    }
  }

  async enableMusicByDefault(): Promise<boolean> {
    if (this.hasStoredMusicPlaybackPreference || !resolveMusicTrack(this.selectedMusicTrackId)) {
      return !this.musicPaused;
    }

    this.musicPaused = false;
    this.persistMusicPlaybackState();
    this.musicResumePending = true;
    this.notifyMusicStateListeners();
    await this.playSelectedMusic();
    return true;
  }

  private ensureContext(): AudioContext | null {
    if (this.context) {
      return this.context;
    }

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      return null;
    }

    this.context = new AudioContextCtor();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 1;
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  private ensureMusicElement(track: MusicTrack): HTMLAudioElement | null {
    if (typeof window === "undefined") {
      return null;
    }

    if (!this.musicElement) {
      this.musicElement = new Audio();
      this.musicElement.preload = "auto";
      this.musicElement.onended = () => {
        void this.handleMusicEnded();
      };
    }

    this.musicElement.volume = MUSIC_VOLUME;
    this.musicElement.loop = this.shouldLoopMusic();
    if (this.currentMusicTrackId !== track.id) {
      this.musicElement.pause();
      this.musicElement.src = track.url;
      this.musicElement.currentTime = 0;
      this.musicElement.load();
      this.currentMusicTrackId = track.id;
    }

    return this.musicElement;
  }

  private persistMusicTrack(): void {
    if (typeof window === "undefined") {
      return;
    }

    if (this.selectedMusicTrackId) {
      window.localStorage.setItem(MUSIC_TRACK_STORAGE_KEY, this.selectedMusicTrackId);
      return;
    }

    window.localStorage.removeItem(MUSIC_TRACK_STORAGE_KEY);
  }

  private persistMusicPlaybackState(): void {
    this.hasStoredMusicPlaybackPreference = true;
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(MUSIC_PLAYBACK_STORAGE_KEY, this.musicPaused ? "paused" : "playing");
  }

  private persistMusicPlaybackMode(): void {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(MUSIC_MODE_STORAGE_KEY, this.musicPlaybackMode);
  }

  private async playSelectedMusic(): Promise<void> {
    const track = resolveMusicTrack(this.selectedMusicTrackId);
    if (!track || this.musicPaused) {
      return;
    }

    const element = this.ensureMusicElement(track);
    if (!element) {
      return;
    }

    try {
      await element.play();
      this.musicResumePending = false;
    } catch {
      this.musicResumePending = true;
    }
  }

  private async handleMusicEnded(): Promise<void> {
    if (this.musicPaused || this.shouldLoopMusic()) {
      return;
    }

    const nextTrack = this.resolveNextMusicTrack();
    if (!nextTrack) {
      return;
    }

    this.selectedMusicTrackId = nextTrack.id;
    this.persistMusicTrack();
    this.notifyMusicStateListeners();
    await this.playSelectedMusic();
  }

  private resolveNextMusicTrack(): MusicTrack | null {
    if (!MUSIC_LIBRARY.length) {
      return null;
    }

    const currentId = this.currentMusicTrackId ?? this.selectedMusicTrackId;
    const currentIndex = MUSIC_LIBRARY.findIndex((track) => track.id === currentId);
    if (currentIndex < 0) {
      return MUSIC_LIBRARY[0] ?? null;
    }

    return MUSIC_LIBRARY[(currentIndex + 1) % MUSIC_LIBRARY.length] ?? MUSIC_LIBRARY[0] ?? null;
  }

  private shouldLoopMusic(): boolean {
    return this.musicPlaybackMode === "single" || MUSIC_LIBRARY.length <= 1;
  }

  private updateMusicElementLoop(): void {
    if (!this.musicElement) {
      return;
    }

    this.musicElement.loop = this.shouldLoopMusic();
  }

  private notifyMusicStateListeners(): void {
    for (const listener of this.musicStateListeners) {
      listener();
    }
  }

  private async load(soundId: UiSoundId): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(soundId);
    if (cached) {
      return cached;
    }

    const pending = this.loading.get(soundId);
    if (pending) {
      return pending;
    }

    const context = this.ensureContext();
    if (!context) {
      return null;
    }

    const promise = fetch(SOUND_LIBRARY[soundId].url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Sound asset ${soundId} could not be loaded.`);
        }

        return response.arrayBuffer();
      })
      .then((buffer) => context.decodeAudioData(buffer.slice(0)))
      .then((audioBuffer) => {
        this.buffers.set(soundId, audioBuffer);
        this.loading.delete(soundId);
        return audioBuffer;
      })
      .catch(() => {
        this.loading.delete(soundId);
        return null;
      });

    this.loading.set(soundId, promise);
    return promise;
  }
}

export const uiSoundManager = new UiSoundManager();

export function bindGlobalUiSounds(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const playInteractiveClick = (element: HTMLElement) => {
    const directive = readDirective(element);
    if (directive === "off") {
      return;
    }

    void uiSoundManager.play(directive ?? "click");
  };

  const onPointerDown = (event: PointerEvent) => {
    void uiSoundManager.unlock();
    const element = resolveInteractiveElement(event.target);
    if (!element) {
      return;
    }

    playInteractiveClick(element);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab" || event.key === "Enter" || event.key === " ") {
      void uiSoundManager.unlock();
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const element = resolveInteractiveElement(event.target);
    if (!element) {
      return;
    }

    playInteractiveClick(element);
  };

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("keydown", onKeyDown, true);

  return () => {
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("keydown", onKeyDown, true);
  };
}
