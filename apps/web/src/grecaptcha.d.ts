interface GRecaptchaRenderOptions {
  sitekey: string;
  size: "invisible";
}

interface GRecaptcha {
  ready(callback: () => void): void;
  render(container: HTMLElement, options: GRecaptchaRenderOptions): number;
  execute(widgetId?: number): Promise<string>;
}

declare global {
  interface Window {
    grecaptcha?: GRecaptcha;
  }
}

export {};
