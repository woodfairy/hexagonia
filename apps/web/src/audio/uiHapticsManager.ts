export type UiHapticId = "dialog" | "nudge" | "success" | "error";

const UI_HAPTICS_STORAGE_KEY = "hexagonia:ui-haptics-muted";
const HAPTIC_LIBRARY: Record<UiHapticId, number | number[]> = {
  dialog: [24, 18, 18],
  nudge: 16,
  success: [18, 24, 30],
  error: [42, 24, 42]
};

function detectHapticsSupport(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator && typeof navigator.vibrate === "function";
}

class UiHapticsManager {
  private muted =
    typeof window !== "undefined" && window.localStorage.getItem(UI_HAPTICS_STORAGE_KEY) === "muted";

  isMuted(): boolean {
    return this.muted;
  }

  isSupported(): boolean {
    return detectHapticsSupport();
  }

  setMuted(nextMuted: boolean): void {
    this.muted = nextMuted;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(UI_HAPTICS_STORAGE_KEY, nextMuted ? "muted" : "on");
    }
  }

  async play(hapticId: UiHapticId): Promise<void> {
    if (this.muted || !detectHapticsSupport()) {
      return;
    }

    try {
      navigator.vibrate(HAPTIC_LIBRARY[hapticId]);
    } catch {
      // Ignore unsupported or blocked vibration attempts.
    }
  }
}

export const uiHapticsManager = new UiHapticsManager();
