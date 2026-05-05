import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { loadRuntimeNodeSourceDetails } from './nodeSourceBridge';

const NODE_SOURCE_DETAILS_PAYLOAD = {
  import_runs: [
    {
      content_fingerprint: 'content-success',
      degraded_reason: null,
      duplicate_semantic: 'new',
      failure_reason: null,
      import_id: 'import-1',
      imported_at: '2026-03-22T10:00:00.000Z',
      node_id: 'node-1',
      provider: 'desktop_text_file',
      result_status: 'imported',
      source_fingerprint: 'source-fingerprint-1',
      source_kind: 'markdown',
      source_locator: '/tmp/note.md',
      source_name: 'note.md'
    }
  ],
  import_source: {
    first_imported_at: '2026-03-20T10:00:00.000Z',
    last_content_fingerprint: 'content-success',
    last_imported_at: '2026-03-22T10:00:00.000Z',
    latest_node_id: 'node-1',
    provider: 'desktop_text_file',
    source_fingerprint: 'source-fingerprint-1',
    source_kind: 'markdown',
    source_locator: '/tmp/note.md',
    source_name: 'note.md'
  },
  inherited_from_parent: true,
  keep_import_item: {
    first_seen_at: '2026-03-20T10:00:00.000Z',
    has_source_update: true,
    highlight_path: '/tmp/readwise/Articles',
    keep_state: 'enabled',
    last_imported_at: '2026-03-22T10:00:00.000Z',
    last_seen_at: '2026-03-22T10:01:00.000Z',
    last_status: 'imported',
    primary_path: '/tmp/readwise/Full Document Contents/Articles',
    rule_id: 'draft-import-source-1',
    rule_label: 'Readwise articles',
    resolved_source_path: '/tmp/readwise/Full Document Contents/Articles/note.md',
    source_mtime_ms: 123,
    source_path: '/tmp/readwise/Full Document Contents/Articles/note.md',
    source_size_bytes: 456,
    source_type: 'readwise'
  },
  source_node_id: 'node-parent'
};

function createMockElectronApi(invoke: ElectronAPI['invoke']): ElectronAPI {
  return {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.electronAPI = undefined;
});

it('normalizes node source details from the runtime bridge', async () => {
  const invoke = vi.fn().mockResolvedValue(NODE_SOURCE_DETAILS_PAYLOAD);
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeNodeSourceDetails('node-1')).resolves.toEqual({
    importRuns: [
      {
        contentFingerprint: 'content-success',
        degradedReason: null,
        duplicateSemantic: 'new',
        failureReason: null,
        importId: 'import-1',
        importedAt: '2026-03-22T10:00:00.000Z',
        nodeId: 'node-1',
        provider: 'desktop_text_file',
        resultStatus: 'imported',
        sourceFingerprint: 'source-fingerprint-1',
        sourceKind: 'markdown',
        sourceLocator: '/tmp/note.md',
        sourceName: 'note.md'
      }
    ],
    importSource: {
      firstImportedAt: '2026-03-20T10:00:00.000Z',
      lastContentFingerprint: 'content-success',
      lastImportedAt: '2026-03-22T10:00:00.000Z',
      latestNodeId: 'node-1',
      provider: 'desktop_text_file',
      sourceFingerprint: 'source-fingerprint-1',
      sourceKind: 'markdown',
      sourceLocator: '/tmp/note.md',
      sourceName: 'note.md'
    },
    inheritedFromParent: true,
    keepImportItem: {
      firstSeenAt: '2026-03-20T10:00:00.000Z',
      hasSourceUpdate: true,
      highlightPath: '/tmp/readwise/Articles',
      keepState: 'enabled',
      lastImportedAt: '2026-03-22T10:00:00.000Z',
      lastSeenAt: '2026-03-22T10:01:00.000Z',
      lastStatus: 'imported',
      primaryPath: '/tmp/readwise/Full Document Contents/Articles',
      ruleId: 'draft-import-source-1',
      ruleLabel: 'Readwise articles',
      resolvedSourcePath: '/tmp/readwise/Full Document Contents/Articles/note.md',
      sourceMtimeMs: 123,
      sourcePath: '/tmp/readwise/Full Document Contents/Articles/note.md',
      sourceSizeBytes: 456,
      sourceType: 'readwise'
    },
    sourceNodeId: 'node-parent'
  });
  expect(invoke).toHaveBeenCalledWith('load_node_source_details', { node_id: 'node-1' });
});
