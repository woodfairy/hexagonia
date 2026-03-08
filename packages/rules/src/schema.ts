export const CURRENT_MATCH_SCHEMA_VERSION = 5;

export function isMatchStateSchemaCompatible(state: {
  schemaVersion?: number | null;
} | null | undefined): boolean {
  return state?.schemaVersion === CURRENT_MATCH_SCHEMA_VERSION;
}
