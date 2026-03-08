type RuntimeConfig = {
  apiBaseUrl?: string | null;
  wsUrl?: string | null;
  recaptchaSiteKey?: string | null;
};

function normalizeValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readRuntimeConfig(): RuntimeConfig {
  if (typeof window === "undefined") {
    return {};
  }

  return window.__HEXAGONIA_CONFIG__ ?? {};
}

export function getRuntimeApiBaseUrl(): string | null {
  return normalizeValue(readRuntimeConfig().apiBaseUrl) ?? normalizeValue(import.meta.env.VITE_API_BASE_URL);
}

export function getRuntimeWebSocketUrl(): string | null {
  return normalizeValue(readRuntimeConfig().wsUrl) ?? normalizeValue(import.meta.env.VITE_WS_URL);
}

export function getRuntimeRecaptchaSiteKey(): string | null {
  return normalizeValue(readRuntimeConfig().recaptchaSiteKey);
}
