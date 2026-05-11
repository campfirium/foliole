import { createDefaultReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';

export function createReadwiseImportPreview() {
  return {
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
    total_count: 1,
    with_highlights_count: 1,
    without_highlights_count: 0,
    write_count: 1
  };
}

export function createReadwiseImportRunResult() {
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

export function createReadwiseCleanupPreview() {
  return {
    delete_count: 1,
    entries: [
      {
        action: 'delete' as const,
        node_id: 'node-readwise-1',
        reason: 'Readwise import is unchanged.',
        rule_id: 'draft-import-source-1',
        source_path: 'Plain.md',
        title: 'Plain'
      }
    ],
    external_document_count: 0,
    external_folder_count: 0,
    keep_count: 0,
    previewed_at: '2026-05-11T00:00:00.000Z',
    total_count: 1
  };
}

export function createReadwiseCleanupRunResult() {
  return {
    ...createReadwiseCleanupPreview(),
    cleaned_at: '2026-05-11T00:02:00.000Z',
    deleted_count: 1,
    detached_count: 0,
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
