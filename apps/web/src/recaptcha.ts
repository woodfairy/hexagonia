import { getRuntimeRecaptchaSiteKey } from "./runtimeConfig";

const RECAPTCHA_SCRIPT_ID = "google-recaptcha-script";
const RECAPTCHA_API_URL = "https://www.google.com/recaptcha/api.js?render=explicit";
const RECAPTCHA_CONTAINER_ID = "google-recaptcha-container";

let scriptPromise: Promise<void> | null = null;
let widgetId: number | null = null;

function getSiteKey(): string | null {
  return getRuntimeRecaptchaSiteKey();
}

function ensureContainer(): HTMLDivElement {
  const existing = document.getElementById(RECAPTCHA_CONTAINER_ID);
  if (existing instanceof HTMLDivElement) {
    return existing;
  }

  const container = document.createElement("div");
  container.id = RECAPTCHA_CONTAINER_ID;
  container.style.position = "absolute";
  container.style.width = "1px";
  container.style.height = "1px";
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);
  return container;
}

function loadScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("reCAPTCHA ist nur im Browser verfuegbar."));
  }

  if (window.grecaptcha) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(RECAPTCHA_SCRIPT_ID);
    if (existing instanceof HTMLScriptElement) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("reCAPTCHA konnte nicht geladen werden.")), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.id = RECAPTCHA_SCRIPT_ID;
    script.src = RECAPTCHA_API_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("reCAPTCHA konnte nicht geladen werden."));
    document.head.appendChild(script);
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

async function ensureWidget(siteKey: string): Promise<number> {
  await loadScript();

  return await new Promise<number>((resolve, reject) => {
    const recaptcha = window.grecaptcha;
    if (!recaptcha) {
      reject(new Error("reCAPTCHA ist nicht verfuegbar."));
      return;
    }

    recaptcha.ready(() => {
      try {
        if (widgetId === null) {
          widgetId = recaptcha.render(ensureContainer(), {
            sitekey: siteKey,
            size: "invisible"
          });
        }
        resolve(widgetId);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("reCAPTCHA konnte nicht initialisiert werden."));
      }
    });
  });
}

export async function getRecaptchaRegisterToken(): Promise<string | null> {
  const siteKey = getSiteKey();
  if (!siteKey) {
    return null;
  }

  const nextWidgetId = await ensureWidget(siteKey);

  return await new Promise<string>((resolve, reject) => {
    const recaptcha = window.grecaptcha;
    if (!recaptcha) {
      reject(new Error("reCAPTCHA ist nicht verfuegbar."));
      return;
    }

    recaptcha.ready(() => {
      recaptcha.execute(nextWidgetId).then(resolve).catch(() => {
        reject(new Error("reCAPTCHA-Pruefung konnte nicht abgeschlossen werden."));
      });
    });
  });
}
