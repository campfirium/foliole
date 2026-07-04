// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { loadNodeSourceDetails } = vi.hoisted(() => ({
  loadNodeSourceDetails: vi.fn()
}));
const { loadNodeSourceUpdatePreview } = vi.hoisted(() => ({
  loadNodeSourceUpdatePreview: vi.fn()
}));
const { acceptPendingIncomingUpdate, dismissPendingIncomingUpdate } = vi.hoisted(() => ({
  acceptPendingIncomingUpdate: vi.fn(),
  dismissPendingIncomingUpdate: vi.fn()
}));
const { notifyManagedInboxUpdated } = vi.hoisted(() => ({
  notifyManagedInboxUpdated: vi.fn()
}));
const { mergeReadwiseTopicHighlights } = vi.hoisted(() => ({
  mergeReadwiseTopicHighlights: vi.fn()
}));
const { loadImportManagerSettings } = vi.hoisted(() => ({
  loadImportManagerSettings: vi.fn()
}));
vi.mock('../database/nodeSourceDetails.js', () => ({ loadNodeSourceDetails }));
vi.mock('../database/importOverview.js', () => ({ loadImportOverview: vi.fn() }));
vi.mock('../database/importMaintenance.js', () => ({ resetImportData: vi.fn() }));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn(),
  upsertNodeSnapshots: vi.fn()
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
vi.mock('../import/incomingUpdateActions.js', () => ({ acceptPendingIncomingUpdate, dismissPendingIncomingUpdate }));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated }));
vi.mock('../import/nodeSourceUpdatePreview.js', () => ({ loadNodeSourceUpdatePreview }));
vi.mock('../import/readwiseTopicMerge.js', () => ({ mergeReadwiseTopicHighlights }));
vi.mock('../import/keepImportMonitor.js', () => ({ refreshKeepImportMonitorFromSettings: vi.fn() }));
vi.mock('../import/managedInboxMonitor.js', () => ({ refreshManagedInboxMonitorFromSettings: vi.fn() }));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn(),
  saveAppSettingsState: vi.fn()
}));

import { handleStorageCommand } from './storageCommands.js';
import {
  EXPECTED_NODE_SOURCE_PAYLOAD,
  IMPORT_MANAGER_SETTINGS_RECORD,
  NODE_SOURCE_DETAILS_RECORD
} from './storageCommands.nodeSourceDetails.testSupport.js';

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

it('returns node source update preview payloads', async () => {
  loadNodeSourceUpdatePreview.mockResolvedValue({
    checked_at: '2026-03-28T04:00:00.000Z',
    current_highlight_count: 2,
    current_content: 'Current content',
    incoming_update_id: 'incoming-update-1',
    kind: 'incoming_update',
    source_node_id: 'node-1',
    updated_highlight_count: 3,
    updated_content: 'Updated content'
  });

  await expect(handleStorageCommand('load_node_source_update_preview', { node_id: 'node-1' })).resolves.toEqual({
    checked_at: '2026-03-28T04:00:00.000Z',
    current_highlight_count: 2,
    current_content: 'Current content',
    incoming_update_id: 'incoming-update-1',
    kind: 'incoming_update',
    source_node_id: 'node-1',
    updated_highlight_count: 3,
    updated_content: 'Updated content'
  });
});

it('accepts incoming updates and notifies workspace refresh channels', async () => {
  const mockWindow = { id: 1 } as never;
  acceptPendingIncomingUpdate.mockReturnValue({
    incoming_update_id: 'incoming-update-1',
    node_id: 'node-1',
    status: 'accepted'
  });

  await expect(handleStorageCommand('accept_incoming_update', {
    content: 'Accepted content',
    incoming_update_id: 'incoming-update-1'
  }, mockWindow)).resolves.toEqual({
    incoming_update_id: 'incoming-update-1',
    node_id: 'node-1',
    status: 'accepted'
  });

  expect(acceptPendingIncomingUpdate).toHaveBeenCalledWith({
    content: 'Accepted content',
    id: 'incoming-update-1'
  });
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith('incoming-update-1');
});

it('dismisses incoming updates without a workspace content mutation', async () => {
  dismissPendingIncomingUpdate.mockReturnValue({
    incoming_update_id: 'incoming-update-1',
    node_id: 'node-1',
    status: 'dismissed'
  });

  await expect(handleStorageCommand('dismiss_incoming_update', {
    incoming_update_id: 'incoming-update-1'
  })).resolves.toEqual({
    incoming_update_id: 'incoming-update-1',
    node_id: 'node-1',
    status: 'dismissed'
  });

  expect(dismissPendingIncomingUpdate).toHaveBeenCalledWith('incoming-update-1');
  expect(notifyManagedInboxUpdated).toHaveBeenCalledWith('incoming-update-1');
});

it('passes the current window into merge highlights command handling', async () => {
  const mockWindow = { id: 1 } as never;
  mergeReadwiseTopicHighlights.mockResolvedValue({
    merged_highlight_count: 1,
    node_id: 'node-1',
    status: 'merged'
  });

  await expect(handleStorageCommand('merge_readwise_topic_highlights', { node_id: 'node-1' }, mockWindow)).resolves.toEqual({
    merged_highlight_count: 1,
    node_id: 'node-1',
    status: 'merged'
  });
  expect(mergeReadwiseTopicHighlights).toHaveBeenCalledWith('node-1', mockWindow);
});
