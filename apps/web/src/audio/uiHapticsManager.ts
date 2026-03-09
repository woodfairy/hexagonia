import { WebHaptics, type HapticPattern, type HapticTriggerOptions } from "web-haptics";

export type UiHapticId = "dialog" | "nudge" | "success" | "error" | "event" | "dice" | "robber" | "soft";

const UI_HAPTICS_STORAGE_KEY = "hexagonia:ui-haptics-muted";
const STRONG_BUZZ_PATTERN: HapticPattern = [{ duration: 1000 }];
const STRONG_BUZZ_OPTIONS: HapticTriggerOptions = { intensity: 1 };
const DICE_HAPTIC_DEDUP_MS = 700;

interface UiHapticDefinition {
  pattern: HapticPattern;
  options?: HapticTriggerOptions;
}

const HAPTIC_LIBRARY: Record<UiHapticId, UiHapticDefinition> = {
  dialog: { pattern: "nudge" },
  nudge: { pattern: "nudge" },
  soft: { pattern: "soft" },
  success: { pattern: "success" },
  error: { pattern: "error" },
  event: {
    pattern: [
      { duration: 16, intensity: 0.34 },
      { delay: 28, duration: 24, intensity: 0.48 }
    ]
  },
  dice: { pattern: STRONG_BUZZ_PATTERN, options: STRONG_BUZZ_OPTIONS },
  robber: { pattern: STRONG_BUZZ_PATTERN, options: STRONG_BUZZ_OPTIONS }
};

class UiHapticsManager {
  private engine: WebHaptics | null = null;
  private muted =
    typeof window !== "undefined" && window.localStorage.getItem(UI_HAPTICS_STORAGE_KEY) === "muted";
  private supported: boolean | null = null;
  private lastPlayedAt: Partial<Record<UiHapticId, number>> = {};

  isMuted(): boolean {
    return this.muted;
  }

  isSupported(): boolean {
    return this.ensureEngine() !== null;
  }

  prime(): void {
    void this.ensureEngine();
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

    if (this.shouldDeduplicate(hapticId)) {
      return;
    }

    const definition = HAPTIC_LIBRARY[hapticId];
    await this.triggerPattern(engine, definition.pattern, definition.options);
    this.lastPlayedAt[hapticId] = Date.now();
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

  private shouldDeduplicate(hapticId: UiHapticId): boolean {
    if (hapticId !== "dice") {
      return false;
    }

    const lastPlayedAt = this.lastPlayedAt[hapticId];
    return typeof lastPlayedAt === "number" && Date.now() - lastPlayedAt < DICE_HAPTIC_DEDUP_MS;
  }

  private async triggerPattern(
    engine: WebHaptics,
    pattern: HapticPattern,
    options?: HapticTriggerOptions
  ): Promise<void> {
    try {
      await engine.trigger(pattern, options);
    } catch {
      // Ignore unsupported or blocked haptic attempts.
    }
  }
}

export const uiHapticsManager = new UiHapticsManager();

export function bindGlobalHapticsUnlock(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const unlockHaptics = () => {
    uiHapticsManager.prime();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab" || event.key === "Enter" || event.key === " ") {
      unlockHaptics();
    }
  };

  window.addEventListener("pointerdown", unlockHaptics, true);
  window.addEventListener("keydown", onKeyDown, true);

  return () => {
    window.removeEventListener("pointerdown", unlockHaptics, true);
    window.removeEventListener("keydown", onKeyDown, true);
  };
}
