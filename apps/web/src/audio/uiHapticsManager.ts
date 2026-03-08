import { WebHaptics, type HapticPattern, type HapticPatternStep } from "web-haptics";

export type UiHapticId = "dialog" | "nudge" | "success" | "error";

const UI_HAPTICS_STORAGE_KEY = "hexagonia:ui-haptics-muted";
const DIALOG_TAP_PATTERN: HapticPatternStep[] = [
  { duration: 24, intensity: 0.42 },
  { delay: 18 },
  { duration: 18, intensity: 0.2 }
];

const HAPTIC_LIBRARY: Record<UiHapticId, HapticPattern> = {
  dialog: DIALOG_TAP_PATTERN,
  nudge: "nudge",
  success: "success",
  error: "error"
};

function detectHapticsSupport(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

class UiHapticsManager {
  private engine: WebHaptics | null = null;
  private muted =
    typeof window !== "undefined" && window.localStorage.getItem(UI_HAPTICS_STORAGE_KEY) === "muted";
  private supported = detectHapticsSupport();

  isMuted(): boolean {
    return this.muted;
  }

  isSupported(): boolean {
    return this.supported;
  }

  setMuted(nextMuted: boolean): void {
    this.muted = nextMuted;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(UI_HAPTICS_STORAGE_KEY, nextMuted ? "muted" : "on");
    }
  }

  async play(hapticId: UiHapticId): Promise<void> {
    if (this.muted || !this.supported) {
      return;
    }

    const engine = this.ensureEngine();
    if (!engine) {
      return;
    }

    try {
      await engine.trigger(HAPTIC_LIBRARY[hapticId]);
    } catch {
      // Ignore unsupported or blocked vibration attempts.
    }
  }

  private ensureEngine(): WebHaptics | null {
    if (this.engine || !this.supported || typeof window === "undefined") {
      return this.engine;
    }

    try {
      this.engine = new WebHaptics({
        debug: false,
        showSwitch: false
      });
    } catch {
      this.engine = null;
      this.supported = false;
    }

    return this.engine;
  }
}

export const uiHapticsManager = new UiHapticsManager();
