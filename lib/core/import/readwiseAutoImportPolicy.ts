export const READWISE_AUTO_IMPORT_POLICY_VERSION = 3;

export const READWISE_AUTO_IMPORT_CATEGORIES = [
  'article', 'email', 'rss', 'pdf', 'epub', 'video', 'tweet'
] as const;

export type ReadwiseAutoImportCategory = typeof READWISE_AUTO_IMPORT_CATEGORIES[number];
export type ReadwiseImportDestination = 'external' | 'inbox' | 'off';
export type ReadwiseAutoImportPolicyField =
  `${ReadwiseAutoImportCategory}${'WithHighlights' | 'WithoutHighlights'}`;
export type ReadwiseAutoImportPolicy = Record<
  ReadwiseAutoImportPolicyField,
  ReadwiseImportDestination
> & {
  importTag: string;
  version: typeof READWISE_AUTO_IMPORT_POLICY_VERSION;
};

function normalizeDestination(value: unknown, fallback: ReadwiseImportDestination) {
  return value === 'external' || value === 'inbox' || value === 'off' ? value : fallback;
}

export function createDefaultReadwiseAutoImportPolicy(): ReadwiseAutoImportPolicy {
  return {
    articleWithHighlights: 'inbox', articleWithoutHighlights: 'off',
    emailWithHighlights: 'inbox', emailWithoutHighlights: 'off',
    rssWithHighlights: 'inbox', rssWithoutHighlights: 'off',
    pdfWithHighlights: 'inbox', pdfWithoutHighlights: 'inbox',
    epubWithHighlights: 'inbox', epubWithoutHighlights: 'inbox',
    videoWithHighlights: 'inbox', videoWithoutHighlights: 'off',
    tweetWithHighlights: 'inbox', tweetWithoutHighlights: 'off',
    importTag: '',
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
  if (payload.version === 1) {
    return {
      ...defaults,
      articleWithHighlights: normalizeDestination(payload.articleWithHighlights, defaults.articleWithHighlights),
      articleWithoutHighlights: normalizeDestination(payload.articleWithoutHighlights, defaults.articleWithoutHighlights),
      epubWithHighlights: normalizeDestination(payload.bookWithHighlights, defaults.epubWithHighlights),
      epubWithoutHighlights: normalizeDestination(payload.bookWithoutHighlights, defaults.epubWithoutHighlights)
    };
  }
  const fields = READWISE_AUTO_IMPORT_CATEGORIES.flatMap((category) => [
    `${category}WithHighlights`, `${category}WithoutHighlights`
  ] as ReadwiseAutoImportPolicyField[]);
  const normalized = Object.fromEntries(fields.map((field) => [
    field, normalizeDestination(payload[field], defaults[field])
  ])) as Partial<ReadwiseAutoImportPolicy>;
  return {
    ...defaults,
    ...normalized,
    importTag: typeof payload.importTag === 'string' ? payload.importTag.trim() : '',
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
  category: ReadwiseAutoImportCategory,
  hasHighlights: boolean,
  matchedImportTag = false
) {
  const suffix = hasHighlights || matchedImportTag ? 'WithHighlights' : 'WithoutHighlights';
  return policy[`${category}${suffix}`];
}

export function enabledReadwiseReaderCategories(policy: ReadwiseAutoImportPolicy) {
  const hasImportTag = policy.importTag.trim().length > 0;
  return READWISE_AUTO_IMPORT_CATEGORIES.filter((category) =>
    resolveReadwiseAutoImportDestination(policy, category, false) !== 'off'
    || (hasImportTag && resolveReadwiseAutoImportDestination(policy, category, true) !== 'off'));
}
