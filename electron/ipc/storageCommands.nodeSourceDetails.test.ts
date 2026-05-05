// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { loadNodeSourceDetails } = vi.hoisted(() => ({
  loadNodeSourceDetails: vi.fn()
}));
const { loadImportManagerSettings } = vi.hoisted(() => ({
  loadImportManagerSettings: vi.fn()
}));
const { loadNodeSourceUpdatePreview } = vi.hoisted(() => ({
  loadNodeSourceUpdatePreview: vi.fn()
}));

vi.mock('../database/nodeSourceDetails.js', () => ({ loadNodeSourceDetails }));
vi.mock('../database/importOverview.js', () => ({ loadImportOverview: vi.fn() }));
vi.mock('../database/importMaintenance.js', () => ({ resetImportData: vi.fn() }));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn()
}));
vi.mock('../database/backupRestore.js', () => ({
  createApplicationDatabaseBackup: vi.fn(),
  listApplicationDatabaseBackups: vi.fn(),
  restoreApplicationDatabaseBackup: vi.fn()
}));
vi.mock('../database/readingProgress.js', () => ({
  loadReadingProgress: vi.fn(),
  saveReadingProgress: vi.fn()
}));
vi.mock('../database/reviewMutations.js', () => ({
  applyReviewGrade: vi.fn(),
  resetNodeReviewState: vi.fn()
}));
vi.mock('../database/workspaceSnapshot.js', () => ({ loadWorkspaceSnapshot: vi.fn() }));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn(),
  saveReviewSchedulerSettings: vi.fn()
}));
vi.mock('../import/importManagerSettings.js', () => ({
  loadImportManagerSettings,
  saveImportManagerSettings: vi.fn()
}));
vi.mock('../import/nodeSourceUpdatePreview.js', () => ({ loadNodeSourceUpdatePreview }));
vi.mock('../import/keepImportMonitor.js', () => ({ refreshKeepImportMonitorFromSettings: vi.fn() }));
vi.mock('../import/managedInboxMonitor.js', () => ({ refreshManagedInboxMonitorFromSettings: vi.fn() }));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn(),
  saveAppSettingsState: vi.fn()
}));

import { handleStorageCommand } from './storageCommands.js';

const NODE_SOURCE_DETAILS_RECORD = {
  importRuns: [
    {
      content_fingerprint: 'content-1',
      degraded_reason: null,
      duplicate_semantic: 'new',
      failure_reason: null,
      id: 'import-1',
      imported_at: '2026-03-26T10:00:00.000Z',
      node_id: 'node-1',
      provider: 'desktop_text_file',
      result_status: 'imported',
      source_fingerprint: 'source-1',
      source_kind: 'markdown',
      source_locator: '/tmp/note.md',
      source_name: 'note.md'
    }
  ],
  importSource: {
    first_imported_at: '2026-03-25T10:00:00.000Z',
    last_content_fingerprint: 'content-1',
    last_imported_at: '2026-03-26T10:00:00.000Z',
    latest_node_id: 'node-1',
    provider: 'desktop_text_file',
    source_fingerprint: 'source-1',
    source_kind: 'markdown',
    source_locator: '/tmp/note.md',
    source_name: 'note.md'
  },
  inheritedFromParent: true,
  keepImportItem: {
    first_seen_at: '2026-03-25T10:00:00.000Z',
    last_imported_at: '2026-03-26T10:00:00.000Z',
    last_seen_at: '2026-03-26T10:05:00.000Z',
    last_status: 'imported',
    rule_id: 'draft-import-source-1',
    source_mtime_ms: 123,
    source_path: '/Users/me/Readwise/Full Document Contents/Articles/note.md',
    source_size_bytes: 456
  },
  sourceNodeId: 'node-parent'
};

const IMPORT_MANAGER_SETTINGS_RECORD = {
  readwiseReaderConfig: {},
  readwiseRootPath: '/Users/me/Readwise',
  readwiseSources: [
    {
      highlightMode: 'split',
      highlightPath: '/Users/me/Readwise/Articles',
      id: 'draft-import-source-1',
      keepPreview: null,
      keepState: 'enabled',
      kind: 'articles',
      primaryPath: '/Users/me/Readwise/Full Document Contents/Articles'
    }
  ],
  sources: [],
  updatedAt: '2026-03-26T00:00:00.000Z',
  version: 3
};

const EXPECTED_NODE_SOURCE_PAYLOAD = {
  import_runs: [
    {
      content_fingerprint: 'content-1',
      degraded_reason: null,
      duplicate_semantic: 'new',
      failure_reason: null,
      import_id: 'import-1',
      imported_at: '2026-03-26T10:00:00.000Z',
      node_id: 'node-1',
      provider: 'desktop_text_file',
      result_status: 'imported',
      source_fingerprint: 'source-1',
      source_kind: 'markdown',
      source_locator: '/tmp/note.md',
      source_name: 'note.md'
    }
  ],
  import_source: {
    first_imported_at: '2026-03-25T10:00:00.000Z',
    last_content_fingerprint: 'content-1',
    last_imported_at: '2026-03-26T10:00:00.000Z',
    latest_node_id: 'node-1',
    provider: 'desktop_text_file',
    source_fingerprint: 'source-1',
    source_kind: 'markdown',
    source_locator: '/tmp/note.md',
    source_name: 'note.md'
  },
  inherited_from_parent: true,
  keep_import_item: {
    first_seen_at: '2026-03-25T10:00:00.000Z',
    highlight_path: '/Users/me/Readwise/Articles',
    keep_state: 'enabled',
    last_imported_at: '2026-03-26T10:00:00.000Z',
    last_seen_at: '2026-03-26T10:05:00.000Z',
    last_status: 'imported',
    primary_path: '/Users/me/Readwise/Full Document Contents/Articles',
    rule_id: 'draft-import-source-1',
    rule_label: 'Readwise articles',
    source_mtime_ms: 123,
    source_path: '/Users/me/Readwise/Full Document Contents/Articles/note.md',
    source_size_bytes: 456,
    source_type: 'readwise'
  },
  source_node_id: 'node-parent'
};

async function expectNodeSourcePayload() {
  await expect(handleStorageCommand('load_node_source_details', { node_id: 'node-1' })).resolves.toEqual(
    EXPECTED_NODE_SOURCE_PAYLOAD
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('serializes node source details with keep-import metadata', async () => {
  loadNodeSourceDetails.mockReturnValue(NODE_SOURCE_DETAILS_RECORD);
  loadImportManagerSettings.mockReturnValue(IMPORT_MANAGER_SETTINGS_RECORD);
  await expectNodeSourcePayload();
});

it('loads node source update preview payloads', async () => {
  loadNodeSourceUpdatePreview.mockResolvedValue({
    checked_at: '2026-03-28T10:00:00.000Z',
    current_content: '# Current',
    source_node_id: 'node-1',
    updated_content: '# Updated'
  });

  await expect(handleStorageCommand('load_node_source_update_preview', { node_id: 'node-1' })).resolves.toEqual({
    checked_at: '2026-03-28T10:00:00.000Z',
    current_content: '# Current',
    source_node_id: 'node-1',
    updated_content: '# Updated'
  });
});
