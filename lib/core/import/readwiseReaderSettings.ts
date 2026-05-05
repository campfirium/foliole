const DEFAULT_VALIDATED_AT = '';
const DEFAULT_HIGHLIGHT_SEPARATOR = '\\n\\n';

export interface ReadwiseReaderConfig {
  highlightSeparator: string;
  validatedAt: string;
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function createDefaultReadwiseReaderConfig(): ReadwiseReaderConfig {
  return {
    highlightSeparator: DEFAULT_HIGHLIGHT_SEPARATOR,
    validatedAt: DEFAULT_VALIDATED_AT
  };
}

export function normalizeReadwiseReaderConfig(value: unknown): ReadwiseReaderConfig {
  const defaults = createDefaultReadwiseReaderConfig();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }

  return {
    highlightSeparator: normalizeString((value as Record<string, unknown>).highlightSeparator, defaults.highlightSeparator),
    validatedAt: normalizeString((value as Record<string, unknown>).validatedAt, defaults.validatedAt)
  };
}

export function isReadwiseReaderConfigReady(config: ReadwiseReaderConfig) {
  return config.highlightSeparator.trim().length > 0 && config.validatedAt.trim().length > 0;
}
