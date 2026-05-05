// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { loadImportOverview } = vi.hoisted(() => ({
  loadImportOverview: vi.fn()
}));
const { resetImportData } = vi.hoisted(() => ({
  resetImportData: vi.fn()
}));

const IMPORT_OVERVIEW_RECORD = {
  latestFailure: {
    contentFingerprint: 'content-failure',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: 'disk failed',
    importId: 'import-2',
    importedAt: '2026-03-22T11:00:00.000Z',
    nodeId: null,
    provider: 'desktop_text_file',
    resultStatus: 'failed',
    sourceFingerprint: 'source-fingerprint-2',
    sourceKind: 'markdown',
    sourceLocator: '/tmp/failure.md',
    sourceName: 'failure.md'
  },
  latestResult: {
    contentFingerprint: 'content-success',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-1',
    importedAt: '2026-03-22T10:00:00.000Z',
    nodeId: 'node-import-1',
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-fingerprint-1',
    sourceKind: 'markdown',
    sourceLocator: '/tmp/note.md',
    sourceName: 'note.md'
  },
  recentRuns: []
};

const IMPORT_OVERVIEW_PAYLOAD = {
  latest_failure: {
    content_fingerprint: 'content-failure',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: 'disk failed',
    import_id: 'import-2',
    imported_at: '2026-03-22T11:00:00.000Z',
    node_id: null,
    provider: 'desktop_text_file',
    result_status: 'failed',
    source_fingerprint: 'source-fingerprint-2',
    source_kind: 'markdown',
    source_locator: '/tmp/failure.md',
    source_name: 'failure.md'
  },
  latest_result: {
    content_fingerprint: 'content-success',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-1',
    imported_at: '2026-03-22T10:00:00.000Z',
    node_id: 'node-import-1',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint-1',
    source_kind: 'markdown',
    source_locator: '/tmp/note.md',
    source_name: 'note.md'
  },
  recent_runs: []
};

vi.mock('../database/importOverview.js', () => ({ loadImportOverview }));
vi.mock('../database/importMaintenance.js', () => ({ resetImportData }));
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
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn(),
  saveAppSettingsState: vi.fn()
}));

import { handleStorageCommand } from './storageCommands.js';

beforeEach(() => {
  vi.clearAllMocks();
});

it('serializes persisted import overview to native payload', async () => {
  loadImportOverview.mockReturnValue(IMPORT_OVERVIEW_RECORD);

  await expect(handleStorageCommand('load_import_overview', {})).resolves.toEqual(IMPORT_OVERVIEW_PAYLOAD);
});

it('dispatches import reset through storage commands', async () => {
  resetImportData.mockReturnValue({
    clearedImportRunCount: 3,
    clearedImportSourceCount: 2,
    clearedKeepImportItemCount: 1,
    deletedNodeCount: 4,
    deletedRootNodeCount: 2
  });

  await expect(handleStorageCommand('reset_import_data', {})).resolves.toEqual({
    clearedImportRunCount: 3,
    clearedImportSourceCount: 2,
    clearedKeepImportItemCount: 1,
    deletedNodeCount: 4,
    deletedRootNodeCount: 2
  });
});
