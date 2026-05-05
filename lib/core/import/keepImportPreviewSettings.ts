import type { NativeReadwiseDetectionSample } from '../../platform/nativeReadwiseContract.js';

export interface KeepImportPreviewSample {
  contentPreview: string | null;
  detail: string | null;
  detectedHighlightCount: number;
  highlightSamples: NativeReadwiseDetectionSample[];
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

function normalizeHighlightSamples(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((sample) => {
      if (!isRecord(sample)) {
        return null;
      }
      if (
        typeof sample.excerpt !== 'string' ||
        typeof sample.highlightText !== 'string' ||
        typeof sample.matched !== 'boolean' ||
        typeof sample.sourceName !== 'string'
      ) {
        return null;
      }
      return {
        excerpt: sample.excerpt,
        highlightText: sample.highlightText,
        matched: sample.matched,
        sourceName: sample.sourceName
      } satisfies NativeReadwiseDetectionSample;
    })
    .filter((sample): sample is NativeReadwiseDetectionSample => sample !== null);
}

function normalizeKeepImportPreviewSample(value: unknown): KeepImportPreviewSample | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.sourcePath !== 'string' ||
    typeof value.contentPreview !== 'string' && value.contentPreview !== null ||
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
    contentPreview: value.contentPreview,
    detail: value.detail,
    detectedHighlightCount: typeof value.detectedHighlightCount === 'number' ? value.detectedHighlightCount : 0,
    highlightSamples: normalizeHighlightSamples(value.highlightSamples),
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
