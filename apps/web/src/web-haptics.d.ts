declare module "web-haptics" {
  export interface HapticPatternStep {
    duration?: number;
    delay?: number;
    intensity?: number;
  }

  export type HapticPattern = string | number[] | HapticPatternStep[];

  export interface WebHapticsOptions {
    debug?: boolean;
    showSwitch?: boolean;
  }

  export class WebHaptics {
    constructor(options?: WebHapticsOptions);
    trigger(pattern: HapticPattern): void | Promise<void>;
  }
}
