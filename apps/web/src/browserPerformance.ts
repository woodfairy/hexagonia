export function isFirefoxBrowser(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("Firefox/");
}
