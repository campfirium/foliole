export const AIDE_READ_TOOL_KEYS = [
  'continueReading',
  'searchCurrent',
  'searchLibrary',
  'traceSource',
  'readPdfPage'
] as const;

export type AideReadToolKey = typeof AIDE_READ_TOOL_KEYS[number];

// Each read switch governs exactly one Aide tool.
export const AIDE_READ_TOOL_NAMES: Record<AideReadToolKey, string> = {
  continueReading: 'read_material',
  readPdfPage: 'read_pdf_page',
  searchCurrent: 'search_in_material',
  searchLibrary: 'search_materials',
  traceSource: 'trace_source'
};

export interface AideToolPermissionSettings {
  read: Record<AideReadToolKey, boolean>;
  readBudget: number;
}

export const AIDE_READ_BUDGET_DEFAULT = 20_000;
export const AIDE_READ_BUDGET_MIN = 1_000;
export const AIDE_READ_BUDGET_MAX = 200_000;

export function createDefaultAideToolPermissionSettings(): AideToolPermissionSettings {
  return {
    read: Object.fromEntries(AIDE_READ_TOOL_KEYS.map((key) => [key, true])) as Record<AideReadToolKey, boolean>,
    readBudget: AIDE_READ_BUDGET_DEFAULT
  };
}

export function normalizeAideToolPermissionSettings(value: unknown): AideToolPermissionSettings {
  const defaults = createDefaultAideToolPermissionSettings();
  if (!value || typeof value !== 'object') return defaults;
  const record = value as { read?: unknown; readBudget?: unknown };
  const read = record.read && typeof record.read === 'object' ? record.read as Record<string, unknown> : {};
  return {
    read: Object.fromEntries(AIDE_READ_TOOL_KEYS.map((key) => [
      key,
      typeof read[key] === 'boolean' ? read[key] : defaults.read[key]
    ])) as Record<AideReadToolKey, boolean>,
    readBudget: normalizeAideReadBudget(record.readBudget)
  };
}

export function normalizeAideReadBudget(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return AIDE_READ_BUDGET_DEFAULT;
  return Math.min(AIDE_READ_BUDGET_MAX, Math.max(AIDE_READ_BUDGET_MIN, Math.round(value)));
}

export function isDefaultAideReadPermissions(settings: AideToolPermissionSettings) {
  const defaults = createDefaultAideToolPermissionSettings();
  return settings.readBudget === defaults.readBudget
    && AIDE_READ_TOOL_KEYS.every((key) => settings.read[key] === defaults.read[key]);
}

export function listAideDisabledToolNames(settings: AideToolPermissionSettings): string[] {
  return AIDE_READ_TOOL_KEYS.filter((key) => !settings.read[key]).map((key) => AIDE_READ_TOOL_NAMES[key]);
}
