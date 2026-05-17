import type { NativeKeepImportPreviewResult } from '../../lib/platform/nativeKeepImportContract.js';

interface KeepImportPreviewEntryLike {
  contentPreview: string | null;
  detectedHighlightCount: number;
  detail: string | null;
  highlightSamples: NativeKeepImportPreviewResult['entries'][number]['highlight_samples'];
  sourcePath: string;
  status: NativeKeepImportPreviewResult['entries'][number]['status'];
}

export function buildKeepImportPreviewResult(
  rootPath: string,
  previewedAt: string,
  entries: KeepImportPreviewEntryLike[]
): NativeKeepImportPreviewResult {
  return {
    blocked_count: entries.filter((entry) => entry.status === 'blocked_deleted').length,
    discovered_count: entries.length,
    entries: entries.map((entry) => ({
      content_preview: entry.contentPreview,
      detail: entry.detail,
      detected_highlight_count: entry.detectedHighlightCount,
      ...(entry.highlightSamples === undefined ? {} : { highlight_samples: entry.highlightSamples }),
      source_path: entry.sourcePath,
      status: entry.status
    })),
    failed_count: entries.filter((entry) => entry.status === 'failed').length,
    new_count: entries.filter((entry) => entry.status === 'new').length,
    previewed_at: previewedAt,
    root_path: rootPath,
    unchanged_count: entries.filter((entry) => entry.status === 'unchanged').length,
    updated_count: entries.filter((entry) => entry.status === 'updated').length
  };
}
