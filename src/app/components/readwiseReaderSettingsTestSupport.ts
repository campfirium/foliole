import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type {
  NativeReadwiseCleanupPreviewResult,
  NativeReadwiseCleanupRunResult,
  NativeReadwiseImportRunResult,
  NativeReadwiseSyncPreviewResult
} from '../../../lib/platform/nativeImportContract';

export function createReadwiseImportPreview(): NativeReadwiseSyncPreviewResult {
  return {
    active_count: 0,
    blocked_count: 0,
    entries: [
      {
        destination: 'inbox',
        detail: null,
        detected_highlight_count: 1,
        highlight_type: 'with_highlights',
        source_kind: 'articles',
        source_path: 'Sample source topic.md',
        status: 'new'
      }
    ],
    external_count: 0,
    failed_count: 0,
    inbox_count: 1,
    off_count: 0,
    previewed_at: '2026-05-11T00:00:00.000Z',
    readwise_root_path: '/Readwise',
    trash_count: 0,
    total_count: 1,
    removed_count: 0,
    with_highlights_count: 1,
    without_highlights_count: 0,
    write_count: 1
  };
}

export function createReadwiseImportRunResult(): NativeReadwiseImportRunResult {
  return {
    completed_at: '2026-05-11T00:01:00.000Z',
    entry_count: 1,
    failed_count: 0,
    imported_count: 1,
    source_count: 4,
    skipped_count: 0,
    status: 'completed'
  };
}

export function createReadwiseCleanupPreview(): NativeReadwiseCleanupPreviewResult {
  return {
    delete_count: 1,
    entries: [
      {
        action: 'keep' as const,
        node_id: 'node-readwise-1',
        reason: 'Topic has additions after import.',
        rule_id: 'draft-import-source-1',
        source_path: 'Plain.md',
        title: 'Plain'
      }
    ],
    external_document_count: 0,
    external_folder_count: 0,
    keep_count: 1,
    previewed_at: '2026-05-11T00:00:00.000Z',
    tracking_only_count: 1,
    total_count: 2
  };
}

export function createReadwiseCleanupRunResult(): NativeReadwiseCleanupRunResult {
  return {
    ...createReadwiseCleanupPreview(),
    cleaned_at: '2026-05-11T00:02:00.000Z',
    deleted_count: 0,
    detached_count: 1,
    external_deleted_count: 0,
    status: 'completed' as const
  };
}

export function createEnabledReadwiseConfig() {
  return {
    ...createDefaultReadwiseReaderConfig(),
    enabled: true,
    validatedAt: '2026-05-11T00:00:00.000Z'
  };
}

export function createDeferredReadwiseImportRunResult() {
  let resolve!: (value: ReturnType<typeof createReadwiseImportRunResult>) => void;
  const promise = new Promise<ReturnType<typeof createReadwiseImportRunResult>>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
