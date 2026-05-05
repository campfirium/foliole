export interface KeepImportPreviewSample {
  detail: string | null;
  sourcePath: string;
  status: 'blocked_deleted' | 'failed' | 'new' | 'unchanged' | 'updated';
}

export interface KeepImportPreviewSummary {
  blockedCount: number;
  discoveredCount: number;
  failedCount: number;
  newCount: number;
  previewedAt: string;
  samples: KeepImportPreviewSample[];
  unchangedCount: number;
  updatedCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeKeepImportPreviewSample(value: unknown): KeepImportPreviewSample | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.sourcePath !== 'string' ||
    typeof value.detail !== 'string' && value.detail !== null ||
    (value.status !== 'new' &&
      value.status !== 'updated' &&
      value.status !== 'unchanged' &&
      value.status !== 'blocked_deleted' &&
      value.status !== 'failed')
  ) {
    return null;
  }
  return {
    detail: value.detail,
    sourcePath: value.sourcePath,
    status: value.status
  };
}

export function normalizeKeepImportPreview(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const samples = Array.isArray(value.samples)
    ? value.samples.map(normalizeKeepImportPreviewSample).filter((sample): sample is KeepImportPreviewSample => sample !== null)
    : [];
  if (
    typeof value.previewedAt !== 'string' ||
    typeof value.discoveredCount !== 'number' ||
    typeof value.newCount !== 'number' ||
    typeof value.updatedCount !== 'number' ||
    typeof value.unchangedCount !== 'number' ||
    typeof value.blockedCount !== 'number' ||
    typeof value.failedCount !== 'number'
  ) {
    return null;
  }
  return {
    blockedCount: value.blockedCount,
    discoveredCount: value.discoveredCount,
    failedCount: value.failedCount,
    newCount: value.newCount,
    previewedAt: value.previewedAt,
    samples,
    unchangedCount: value.unchangedCount,
    updatedCount: value.updatedCount
  } satisfies KeepImportPreviewSummary;
}
