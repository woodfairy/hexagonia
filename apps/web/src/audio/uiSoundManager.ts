import clickUrl from "../../../../assets/sounds/ui-click.wav";
import closeUrl from "../../../../assets/sounds/ui-close.wav";
import errorUrl from "../../../../assets/sounds/ui-error.wav";
import notifyUrl from "../../../../assets/sounds/ui-notify.wav";
import openUrl from "../../../../assets/sounds/ui-open.wav";
import successUrl from "../../../../assets/sounds/ui-success.wav";

export type UiSoundId = "click" | "open" | "close" | "success" | "notify" | "error";

type UiSoundDirective = UiSoundId | "off";

interface UiSoundDefinition {
  url: string;
  volume: number;
  playbackRate?: number;
}

interface UiSoundPlayOptions {
  volume?: number;
  playbackRate?: number;
}

const UI_SOUND_STORAGE_KEY = "hexagonia:ui-sound-muted";
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

type AudioContextConstructor = typeof AudioContext;

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

class UiSoundManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<UiSoundId, AudioBuffer>();
  private loading = new Map<UiSoundId, Promise<AudioBuffer | null>>();
  private muted =
    typeof window !== "undefined" && window.localStorage.getItem(UI_SOUND_STORAGE_KEY) === "muted";

  isMuted(): boolean {
    return this.muted;
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
    if (!context || context.state !== "suspended") {
      return;
    }

    try {
      await context.resume();
    } catch {
      // Browsers may still block resume until a later gesture.
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
