export const defaultReviewSchedulerSettings = {
  algorithm: 'ts-fsrs@4.3.0',
  desiredRetention: 0.9,
  maximumIntervalDays: 36500,
  enableShortTerm: false,
  pushQueue: {
    defaultPriority: 5,
    priorityRatio: 5,
    queueMixRatio: { reading: 1, fsrs: 5 },
    readingInitialIntervalMs: 24 * 60 * 60 * 1000,
    readingIntervalGrowthFactorRange: { min: 1.1, max: 1.5 }
  },
  updatedAt: '2026-03-06T00:00:00.000Z'
};

export const importedMarkdownResult = {
  contentFingerprint: 'content-fingerprint',
  degradedReason: null,
  duplicateSemantic: 'new',
  failureReason: null,
  importId: 'import-1',
  importedAt: '2026-03-22T10:00:00.000Z',
  nodeId: 'node-import-1',
  provider: 'desktop_text_file',
  resultStatus: 'imported',
  sourceFingerprint: 'source-fingerprint',
  sourceKind: 'markdown',
  sourceLocator: '/tmp/inbox.md',
  sourceName: 'inbox.md'
};

export const failedMarkdownResult = {
  contentFingerprint: 'content-fingerprint',
  degradedReason: null,
  duplicateSemantic: 'new',
  failureReason: 'disk failed',
  importId: 'import-2',
  importedAt: '2026-03-22T10:00:00.000Z',
  nodeId: null,
  provider: 'desktop_text_file',
  resultStatus: 'failed',
  sourceFingerprint: 'source-fingerprint',
  sourceKind: 'markdown',
  sourceLocator: '/tmp/inbox.md',
  sourceName: 'inbox.md'
};

export const importedHtmlResult = {
  contentFingerprint: 'content-fingerprint',
  degradedReason: null,
  duplicateSemantic: 'new',
  failureReason: null,
  importId: 'import-3',
  importedAt: '2026-03-22T10:20:00.000Z',
  nodeId: 'node-import-3',
  provider: 'desktop_text_file',
  resultStatus: 'imported',
  sourceFingerprint: 'source-fingerprint-html',
  sourceKind: 'html',
  sourceLocator: '/tmp/inbox.html',
  sourceName: 'inbox.html'
};
