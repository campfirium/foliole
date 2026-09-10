export const READWISE_AUTO_IMPORT_POLICY_VERSION = 1;

export type ReadwiseContentKind = 'article' | 'book';
export type ReadwiseImportDestination = 'external' | 'inbox' | 'off';

export interface ReadwiseAutoImportPolicy {
  articleWithHighlights: ReadwiseImportDestination;
  articleWithoutHighlights: ReadwiseImportDestination;
  bookWithHighlights: ReadwiseImportDestination;
  bookWithoutHighlights: ReadwiseImportDestination;
  version: typeof READWISE_AUTO_IMPORT_POLICY_VERSION;
}

function normalizeDestination(value: unknown, fallback: ReadwiseImportDestination) {
  return value === 'external' || value === 'inbox' || value === 'off' ? value : fallback;
}

export function createDefaultReadwiseAutoImportPolicy(): ReadwiseAutoImportPolicy {
  return {
    articleWithHighlights: 'inbox',
    articleWithoutHighlights: 'off',
    bookWithHighlights: 'inbox',
    bookWithoutHighlights: 'inbox',
    version: READWISE_AUTO_IMPORT_POLICY_VERSION
  };
}

export function normalizeReadwiseAutoImportPolicy(value: unknown): ReadwiseAutoImportPolicy {
  const defaults = createDefaultReadwiseAutoImportPolicy();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const payload = value as Record<string, unknown>;
  if (typeof payload.version === 'number' && payload.version > READWISE_AUTO_IMPORT_POLICY_VERSION) {
    throw new Error('readwise_auto_import_policy_version_unsupported');
  }
  return {
    articleWithHighlights: normalizeDestination(
      payload.articleWithHighlights,
      defaults.articleWithHighlights
    ),
    articleWithoutHighlights: normalizeDestination(
      payload.articleWithoutHighlights,
      defaults.articleWithoutHighlights
    ),
    bookWithHighlights: normalizeDestination(payload.bookWithHighlights, defaults.bookWithHighlights),
    bookWithoutHighlights: normalizeDestination(
      payload.bookWithoutHighlights,
      defaults.bookWithoutHighlights
    ),
    version: READWISE_AUTO_IMPORT_POLICY_VERSION
  };
}

export function migrateLegacyReadwiseAutoImportPolicy(value: unknown): ReadwiseAutoImportPolicy {
  const payload = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const defaults = createDefaultReadwiseAutoImportPolicy();
  return {
    ...defaults,
    articleWithHighlights: normalizeDestination(payload.withHighlightsDestination, 'inbox'),
    articleWithoutHighlights: normalizeDestination(payload.withoutHighlightsDestination, 'off')
  };
}

export function resolveReadwiseAutoImportDestination(
  policy: ReadwiseAutoImportPolicy,
  contentKind: ReadwiseContentKind,
  hasHighlights: boolean
) {
  if (contentKind === 'book') {
    return hasHighlights ? policy.bookWithHighlights : policy.bookWithoutHighlights;
  }
  return hasHighlights ? policy.articleWithHighlights : policy.articleWithoutHighlights;
}
