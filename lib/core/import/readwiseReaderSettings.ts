const DEFAULT_VALIDATED_AT = '';
const DEFAULT_HIGHLIGHTS_HEADING = '## Highlights';
const DEFAULT_NEW_HIGHLIGHTS_HEADING = '## New highlights added';
const DEFAULT_HIGHLIGHT_SEPARATOR = '\\n\\n';
const DEFAULT_TAG_KEYWORD = 'Tags:';
const DEFAULT_NOTE_KEYWORD = 'Note:';
const DEFAULT_IMPORT_SCOPE = 'highlights_only';

export type ReadwiseImportScope = 'all' | 'highlights_only';

export interface ReadwiseReaderConfig {
  highlightsHeading: string;
  highlightSeparator: string;
  importScope: ReadwiseImportScope;
  newHighlightsHeading: string;
  noteKeyword: string;
  tagKeyword: string;
  validatedAt: string;
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function createDefaultReadwiseReaderConfig(): ReadwiseReaderConfig {
  return {
    highlightsHeading: DEFAULT_HIGHLIGHTS_HEADING,
    highlightSeparator: DEFAULT_HIGHLIGHT_SEPARATOR,
    importScope: DEFAULT_IMPORT_SCOPE,
    newHighlightsHeading: DEFAULT_NEW_HIGHLIGHTS_HEADING,
    noteKeyword: DEFAULT_NOTE_KEYWORD,
    tagKeyword: DEFAULT_TAG_KEYWORD,
    validatedAt: DEFAULT_VALIDATED_AT
  };
}

export function normalizeReadwiseReaderConfig(value: unknown): ReadwiseReaderConfig {
  const defaults = createDefaultReadwiseReaderConfig();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }

  return {
    highlightsHeading: normalizeString((value as Record<string, unknown>).highlightsHeading, defaults.highlightsHeading),
    highlightSeparator: normalizeString((value as Record<string, unknown>).highlightSeparator, defaults.highlightSeparator),
    importScope: (value as Record<string, unknown>).importScope === 'all' ? 'all' : defaults.importScope,
    newHighlightsHeading: normalizeString((value as Record<string, unknown>).newHighlightsHeading, defaults.newHighlightsHeading),
    noteKeyword: normalizeString((value as Record<string, unknown>).noteKeyword, defaults.noteKeyword),
    tagKeyword: normalizeString((value as Record<string, unknown>).tagKeyword, defaults.tagKeyword),
    validatedAt: normalizeString((value as Record<string, unknown>).validatedAt, defaults.validatedAt)
  };
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
