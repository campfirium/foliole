import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  clear: vi.fn(),
  download: vi.fn(),
  load: vi.fn()
}));

vi.mock('../../lib/core/sync/syncPackResourceArticles.js', () => ({
  clearSyncPackResourceArticles: runtime.clear,
  loadSyncPackResourceArticleBatch: runtime.load
}));
vi.mock('../database/betterSqliteDbPort.js', () => ({
  createBetterSqliteDbPort: vi.fn(() => ({}))
}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: vi.fn(() => ({ sqlite: {} })),
  runWithDatabaseConnectionOwner: async (work: () => Promise<unknown>) => work()
}));
vi.mock('./desktopSyncGroupResources.js', () => ({
  downloadDesktopSyncGroupResources: runtime.download
}));

import { drainDesktopSyncGroupResourceArticles } from './desktopSyncGroupResourceArticleDrain.js';

const peer = { group_id: 'group', peer_device_id: 'peer' } as never;

beforeEach(() => {
  vi.resetAllMocks();
  runtime.load.mockResolvedValueOnce(['article-a']).mockResolvedValueOnce([]);
  runtime.download.mockResolvedValue({ failedStorageKeys: [], unreadableArticleIds: [],
    resourceResults: [], remainingContentBlobCount: 0 });
});

it('clears only a completed batch', async () => {
  await drainDesktopSyncGroupResourceArticles(peer);
  expect(runtime.download).toHaveBeenCalledWith(peer, [], true);
  expect(runtime.download).toHaveBeenCalledWith(peer, ['article-a'], false);
  expect(runtime.clear).toHaveBeenCalledWith(expect.anything(), 'group', 'peer', ['article-a']);
});

it('retains a batch whose article body cannot yet expose its attachments', async () => {
  runtime.download.mockResolvedValueOnce({ failedStorageKeys: [], unreadableArticleIds: [],
    resourceResults: [], remainingContentBlobCount: 0 });
  runtime.download.mockResolvedValueOnce({ failedStorageKeys: [], unreadableArticleIds: ['article-a'],
    resourceResults: [], remainingContentBlobCount: 0 });
  await expect(drainDesktopSyncGroupResourceArticles(peer)).rejects
    .toThrow('sync_group_resources_incomplete');
  expect(runtime.clear).not.toHaveBeenCalled();
});

it('reports exhausted storage and leaves the pending article for a later retry', async () => {
  runtime.download.mockResolvedValueOnce({ failedStorageKeys: [], unreadableArticleIds: [],
    resourceResults: [], remainingContentBlobCount: 0 });
  runtime.download.mockResolvedValueOnce({ failedStorageKeys: ['attachment'], unreadableArticleIds: [],
    resourceResults: [{ unresolved: ['attachment:a'], issues: [{ error: 'disk_full' }] }],
    remainingContentBlobCount: 0 });
  await expect(drainDesktopSyncGroupResourceArticles(peer)).rejects
    .toThrow('sync_group_resources_disk_full');
  expect(runtime.clear).not.toHaveBeenCalled();
});

it('continues bounded content batches until the stored backlog is empty', async () => {
  runtime.load.mockReset().mockResolvedValue([]);
  runtime.download.mockResolvedValueOnce({ failedStorageKeys: [], unreadableArticleIds: [],
    resourceResults: [], remainingContentBlobCount: 1 });
  runtime.download.mockResolvedValueOnce({ failedStorageKeys: [], unreadableArticleIds: [],
    resourceResults: [], remainingContentBlobCount: 0 });
  await drainDesktopSyncGroupResourceArticles(peer);
  expect(runtime.download).toHaveBeenCalledTimes(2);
});
