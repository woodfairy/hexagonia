import { WebHaptics, type HapticPattern } from "web-haptics";

export type UiHapticId = "dialog" | "nudge" | "success" | "error" | "event" | "dice" | "robber" | "soft";

const UI_HAPTICS_STORAGE_KEY = "hexagonia:ui-haptics-muted";
const HAPTIC_LIBRARY: Record<UiHapticId, HapticPattern> = {
  dialog: "nudge",
  nudge: "nudge",
  soft: "soft",
  success: "success",
  error: "error",
  event: [
    { duration: 16, intensity: 0.34 },
    { delay: 28, duration: 24, intensity: 0.48 }
  ],
  dice: [
    { duration: 14, intensity: 0.22 },
    { delay: 18, duration: 18, intensity: 0.34 },
    { delay: 22, duration: 28, intensity: 0.54 },
    { delay: 24, duration: 46, intensity: 0.78 }
  ],
  robber: [
    { duration: 24, intensity: 0.68 },
    { delay: 34, duration: 18, intensity: 0.28 },
    { delay: 24, duration: 56, intensity: 0.92 }
  ]
};

class UiHapticsManager {
  private engine: WebHaptics | null = null;
  private muted =
    typeof window !== "undefined" && window.localStorage.getItem(UI_HAPTICS_STORAGE_KEY) === "muted";
  private supported: boolean | null = null;

  isMuted(): boolean {
    return this.muted;
  }

  isSupported(): boolean {
    return this.ensureEngine() !== null;
  }

  setMuted(nextMuted: boolean): void {
    this.muted = nextMuted;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(UI_HAPTICS_STORAGE_KEY, nextMuted ? "muted" : "on");
    }
  }

  async play(hapticId: UiHapticId): Promise<void> {
    if (this.muted) {
      return;
    }

    const engine = this.ensureEngine();
    if (!engine) {
      return;
    }

    try {
      await engine.trigger(HAPTIC_LIBRARY[hapticId]);
    } catch {
      // Ignore unsupported or blocked haptic attempts.
    }
  }

  private ensureEngine(): WebHaptics | null {
    if (this.engine) {
      return this.engine;
    }

    if (this.supported === false || typeof window === "undefined") {
      return null;
    }

    try {
      this.engine = new WebHaptics({
        debug: false,
        showSwitch: false
      });
      this.supported = true;
    } catch {
      this.engine = null;
      this.supported = false;
    }

    return this.engine;
  }
}

export const uiHapticsManager = new UiHapticsManager();
