export const SUPPORTED_LOCALES = ["de", "en"] as const;

export const DEFAULT_LOCALE = "de";

export type Locale = string;

const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

export function sanitizeLocale(value: unknown): Locale | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || !LOCALE_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeLocale(value: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  return sanitizeLocale(value) ?? fallback;
}

export function isSupportedLocale(value: unknown): value is (typeof SUPPORTED_LOCALES)[number] {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value.toLowerCase() as (typeof SUPPORTED_LOCALES)[number]);
}
