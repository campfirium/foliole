export const COMPANION_CUSTOM_CSS_SETTING_KEY = 'custom_css_snippets';
export const COMPANION_CUSTOM_CSS_VERSION = 1 as const;
export const MAX_COMPANION_CUSTOM_CSS_SNIPPETS = 16;
export const MAX_COMPANION_CUSTOM_CSS_NAME_CODE_POINTS = 80;
export const MAX_COMPANION_CUSTOM_CSS_SOURCE_BYTES = 16 * 1024;
export const MAX_COMPANION_CUSTOM_CSS_TOTAL_SOURCE_BYTES = 64 * 1024;
export const MAX_COMPANION_CUSTOM_CSS_TOTAL_COMPILED_BYTES = 128 * 1024;

export interface CompanionCustomCssSnippet {
  enabled: boolean;
  id: string;
  name: string;
  sourceCss: string;
}

export interface CompanionCustomCssCollection {
  snippets: CompanionCustomCssSnippet[];
  version: typeof COMPANION_CUSTOM_CSS_VERSION;
}

export type CompanionCustomCssValidationCode =
  | 'collection-shape'
  | 'duplicate-id'
  | 'name'
  | 'snippet-count'
  | 'snippet-shape'
  | 'source-size'
  | 'total-source-size'
  | 'version';

export class CompanionCustomCssValidationError extends Error {
  constructor(readonly code: CompanionCustomCssValidationCode, message: string) {
    super(message);
    this.name = 'CompanionCustomCssValidationError';
  }
}

const COMPANION_CUSTOM_CSS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createEmptyCompanionCustomCssCollection(): CompanionCustomCssCollection {
  return { snippets: [], version: COMPANION_CUSTOM_CSS_VERSION };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: string[]) {
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

export function getCompanionCustomCssUtf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function normalizeSnippet(raw: unknown): CompanionCustomCssSnippet {
  if (!isRecord(raw) || !hasExactKeys(raw, ['enabled', 'id', 'name', 'sourceCss'])) {
    throw new CompanionCustomCssValidationError('snippet-shape', 'A custom style entry is malformed.');
  }
  if (typeof raw.id !== 'string' || !COMPANION_CUSTOM_CSS_ID.test(raw.id)) {
    throw new CompanionCustomCssValidationError('snippet-shape', 'A custom style id is invalid.');
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || [...name].length > MAX_COMPANION_CUSTOM_CSS_NAME_CODE_POINTS) {
    throw new CompanionCustomCssValidationError('name', 'A custom style name is invalid.');
  }
  if (typeof raw.sourceCss !== 'string' || typeof raw.enabled !== 'boolean') {
    throw new CompanionCustomCssValidationError('snippet-shape', 'A custom style entry is malformed.');
  }
  if (getCompanionCustomCssUtf8Bytes(raw.sourceCss) > MAX_COMPANION_CUSTOM_CSS_SOURCE_BYTES) {
    throw new CompanionCustomCssValidationError('source-size', 'A custom style is too large.');
  }
  return { enabled: raw.enabled, id: raw.id, name, sourceCss: raw.sourceCss };
}

export function normalizeCompanionCustomCssCollection(raw: unknown): CompanionCustomCssCollection {
  if (!isRecord(raw) || !hasExactKeys(raw, ['snippets', 'version'])) {
    throw new CompanionCustomCssValidationError('collection-shape', 'The custom style collection is malformed.');
  }
  if (raw.version !== COMPANION_CUSTOM_CSS_VERSION) {
    throw new CompanionCustomCssValidationError('version', 'The custom style collection version is unsupported.');
  }
  if (!Array.isArray(raw.snippets) || raw.snippets.length > MAX_COMPANION_CUSTOM_CSS_SNIPPETS) {
    throw new CompanionCustomCssValidationError('snippet-count', 'The custom style collection has too many entries.');
  }
  const snippets = raw.snippets.map(normalizeSnippet);
  if (new Set(snippets.map((snippet) => snippet.id)).size !== snippets.length) {
    throw new CompanionCustomCssValidationError('duplicate-id', 'Custom style ids must be unique.');
  }
  const totalBytes = snippets.reduce((sum, snippet) => sum + getCompanionCustomCssUtf8Bytes(snippet.sourceCss), 0);
  if (totalBytes > MAX_COMPANION_CUSTOM_CSS_TOTAL_SOURCE_BYTES) {
    throw new CompanionCustomCssValidationError('total-source-size', 'The custom style collection is too large.');
  }
  return { snippets, version: COMPANION_CUSTOM_CSS_VERSION };
}
