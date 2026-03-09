export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const USERNAME_PATTERN = /^[A-Za-z0-9]+$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function sanitizeUsernameInput(username: string): string {
  return username.replace(/[^A-Za-z0-9]/g, "");
}
