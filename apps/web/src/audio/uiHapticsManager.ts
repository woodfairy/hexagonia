import { WebHaptics, type HapticPattern } from "web-haptics";

export type UiHapticId = "dialog" | "nudge" | "success" | "error";

const UI_HAPTICS_STORAGE_KEY = "hexagonia:ui-haptics-muted";
const HAPTIC_LIBRARY: Record<UiHapticId, HapticPattern> = {
  dialog: "nudge",
  nudge: "nudge",
  success: "success",
  error: "error"
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
