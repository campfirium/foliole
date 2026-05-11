const DEFAULT_VALIDATED_AT = '';
const DEFAULT_HIGHLIGHTS_HEADING = '## Highlights';
const DEFAULT_NEW_HIGHLIGHTS_HEADING = '## New highlights added';
const DEFAULT_HIGHLIGHT_SEPARATOR = '\\n\\n';
const DEFAULT_TAG_KEYWORD = 'Tags:';
const DEFAULT_NOTE_KEYWORD = 'Note:';
const DEFAULT_IMPORT_SCOPE = 'highlights_only';
const DEFAULT_SYNC_FREQUENCY = 'hourly';
const DEFAULT_WITH_HIGHLIGHTS_DESTINATION = 'inbox';
const DEFAULT_WITHOUT_HIGHLIGHTS_DESTINATION = 'off';

export type ReadwiseImportDestination = 'external' | 'inbox';
export type ReadwiseImportScope = 'all' | 'highlights_only';
export type ReadwiseSyncFrequency = 'daily' | 'every_12_hours' | 'hourly' | 'weekly';
export type ReadwiseWithoutHighlightsDestination = ReadwiseImportDestination | 'off';

export interface ReadwiseReaderConfig {
  enabled: boolean;
  highlightsHeading: string;
  highlightSeparator: string;
  importScope: ReadwiseImportScope;
  newHighlightsHeading: string;
  noteKeyword: string;
  syncFrequency: ReadwiseSyncFrequency;
  tagKeyword: string;
  validatedAt: string;
  withHighlightsDestination: ReadwiseImportDestination;
  withoutHighlightsDestination: ReadwiseWithoutHighlightsDestination;
}

interface NormalizeReadwiseReaderConfigOptions {
  enabledFallback?: boolean;
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeReadwiseImportScope(value: unknown, fallback: ReadwiseImportScope) {
  return value === 'all' ? 'all' : fallback;
}

function normalizeWithHighlightsDestination(value: unknown, fallback: ReadwiseImportDestination) {
  return value === 'external' || value === 'inbox' ? value : fallback;
}

function normalizeWithoutHighlightsDestination(
  value: unknown,
  fallback: ReadwiseWithoutHighlightsDestination
) {
  return value === 'external' || value === 'inbox' || value === 'off' ? value : fallback;
}

function normalizeSyncFrequency(value: unknown, fallback: ReadwiseSyncFrequency) {
  return value === 'hourly' || value === 'every_12_hours' || value === 'daily' || value === 'weekly'
    ? value
    : fallback;
}

function deriveLegacyImportScope(
  destination: ReadwiseWithoutHighlightsDestination
): ReadwiseImportScope {
  return destination === 'inbox' ? 'all' : 'highlights_only';
}

export function createDefaultReadwiseReaderConfig(): ReadwiseReaderConfig {
  return {
    enabled: false,
    highlightsHeading: DEFAULT_HIGHLIGHTS_HEADING,
    highlightSeparator: DEFAULT_HIGHLIGHT_SEPARATOR,
    importScope: DEFAULT_IMPORT_SCOPE,
    newHighlightsHeading: DEFAULT_NEW_HIGHLIGHTS_HEADING,
    noteKeyword: DEFAULT_NOTE_KEYWORD,
    syncFrequency: DEFAULT_SYNC_FREQUENCY,
    tagKeyword: DEFAULT_TAG_KEYWORD,
    validatedAt: DEFAULT_VALIDATED_AT,
    withHighlightsDestination: DEFAULT_WITH_HIGHLIGHTS_DESTINATION,
    withoutHighlightsDestination: DEFAULT_WITHOUT_HIGHLIGHTS_DESTINATION
  };
}

export function normalizeReadwiseReaderConfig(
  value: unknown,
  options: NormalizeReadwiseReaderConfigOptions = {}
): ReadwiseReaderConfig {
  const defaults = createDefaultReadwiseReaderConfig();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaults, enabled: options.enabledFallback ?? defaults.enabled };
  }
  const payload = value as Record<string, unknown>;
  const legacyImportScope = normalizeReadwiseImportScope(payload.importScope, defaults.importScope);
  const legacyWithoutHighlightsDestination =
    legacyImportScope === 'all' ? 'inbox' : defaults.withoutHighlightsDestination;
  const withoutHighlightsDestination = normalizeWithoutHighlightsDestination(
    payload.withoutHighlightsDestination,
    legacyWithoutHighlightsDestination
  );

  return {
    enabled:
      typeof payload.enabled === 'boolean'
        ? payload.enabled
        : (options.enabledFallback ?? defaults.enabled),
    highlightsHeading: normalizeString(payload.highlightsHeading, defaults.highlightsHeading),
    highlightSeparator: normalizeString(payload.highlightSeparator, defaults.highlightSeparator),
    importScope: deriveLegacyImportScope(withoutHighlightsDestination),
    newHighlightsHeading: normalizeString(
      payload.newHighlightsHeading,
      defaults.newHighlightsHeading
    ),
    noteKeyword: normalizeString(payload.noteKeyword, defaults.noteKeyword),
    syncFrequency: normalizeSyncFrequency(payload.syncFrequency, defaults.syncFrequency),
    tagKeyword: normalizeString(payload.tagKeyword, defaults.tagKeyword),
    validatedAt: normalizeString(payload.validatedAt, defaults.validatedAt),
    withHighlightsDestination: normalizeWithHighlightsDestination(
      payload.withHighlightsDestination,
      defaults.withHighlightsDestination
    ),
    withoutHighlightsDestination
  };
}

export function resolveReadwiseImportDestination(
  config: Pick<ReadwiseReaderConfig, 'withHighlightsDestination' | 'withoutHighlightsDestination'>,
  hasHighlights: boolean
) {
  return hasHighlights ? config.withHighlightsDestination : config.withoutHighlightsDestination;
}

export function isReadwiseReaderConfigReady(config: ReadwiseReaderConfig) {
  return (
    config.highlightsHeading.trim().length > 0 &&
    config.newHighlightsHeading.trim().length > 0 &&
    config.highlightSeparator.trim().length > 0 &&
    config.tagKeyword.trim().length > 0 &&
    config.noteKeyword.trim().length > 0 &&
    config.validatedAt.trim().length > 0
  );
}
