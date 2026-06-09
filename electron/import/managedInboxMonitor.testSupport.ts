import type { NativeDirectoryImportEntry, NativeDirectoryImportResult } from '../../lib/platform/nativeContract.js';

export function createManagedInboxImportEntry(
  overrides: Partial<NativeDirectoryImportEntry> = {}
): NativeDirectoryImportEntry {
  return {
    adapter: 'markdown_directory',
    content_fingerprint: 'content-1',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-a',
    imported_at: '2026-03-25T00:00:00.000Z',
    node_id: 'node-a',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-1',
    source_kind: 'markdown',
    source_locator: '/tmp/inbox/a.md',
    source_name: 'a.md',
    ...overrides
  };
}

export function createManagedInboxImportResult(
  overrides: Partial<NativeDirectoryImportResult> = {}
): NativeDirectoryImportResult {
  const entries = overrides.entries ?? [createManagedInboxImportEntry()];
  return {
    archive_root_path: null,
    consume_policy: 'clear',
    consumed_count: 0,
    discovered_count: entries.length,
    entries,
    failed_count: entries.filter((entry) => entry.result_status === 'failed').length,
    imported_count: entries.filter((entry) => entry.result_status !== 'failed').length,
    root_path: '/tmp/inbox',
    source_adapter: 'foliole_managed_inbox_folder',
    ...overrides
  };
}
