import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import {
  commitStagedCompanionAttachmentBatch,
  commitStagedCompanionContentBatch
} from './companionBatchDataPlane';

it('carries only a native pack path through the Web contract before shared content commit', async () => {
  const { owner, port } = fakeOwner();
  port.query = vi.fn(async (sql: string) => {
    if (sql.includes('quick_check')) return [{ quick_check: 'ok' }];
    if (sql.includes('table_info')) return ['hash', 'size_bytes', 'data'].map((name) => ({ name }));
    if (sql.includes('COUNT(*)')) return [{ count: 0 }];
    if (sql.includes('INNER JOIN')) return [{ hash: 'a'.repeat(64) }];
    return [];
  }) as DbPort['query'];
  const plugin = {
    finishContentBlobBatch: vi.fn(async () => ({}))
  };

  const download = {
    batch_token: 'native-token', failed_hashes: [], pack_path: '/native/cache/content.db',
    synced_hashes: ['a'.repeat(64)]
  };
  await expect(commitStagedCompanionContentBatch(
    owner, plugin as never, download, '2026-08-06T00:00:00.000Z'
  )).resolves.toEqual({ failedHashes: [], syncedHashes: ['a'.repeat(64)] });

  expect(port.run).toHaveBeenCalledWith("ATTACH DATABASE '/native/cache/content.db' AS content_batch");
  expect(plugin.finishContentBlobBatch).toHaveBeenCalledWith({ batch_token: 'native-token', committed: true });
  expect(download).not.toHaveProperty('data');
});

it('stages native attachment files and commits only their small manifest', async () => {
  const { owner, port } = fakeOwner();
  port.query = vi.fn(async () => [{ content_hash: 'b'.repeat(64), size_bytes: 32_600_000 }]) as DbPort['query'];
  const plugin = {
    finishAttachmentResourceBatch: vi.fn(async () => ({})),
    stageAttachmentResourceBatch: vi.fn(async () => ({
      failed_attachment_ids: [],
      manifest: [{
        attachment_id: 'att-1', content_hash: 'b'.repeat(64), size_bytes: 32_600_000, storage_key: 'b'.repeat(64)
      }]
    }))
  };

  await expect(commitStagedCompanionAttachmentBatch(
    owner, plugin as never, 'attachment-token', '2026-08-06T00:00:00.000Z'
  )).resolves.toEqual({ failedIds: [], syncedIds: ['att-1'] });

  expect(plugin.stageAttachmentResourceBatch).toHaveBeenCalledWith({ batch_token: 'attachment-token' });
  expect(plugin.finishAttachmentResourceBatch).toHaveBeenCalledWith({ batch_token: 'attachment-token', committed: true });
  expect(port.run).toHaveBeenCalledWith(expect.stringContaining("availability = 'cached'"), expect.any(Array));
});

it('reports failed shared commits so native staging can roll back', async () => {
  const contentPlugin = { finishContentBlobBatch: vi.fn(async () => ({})) };
  const attachmentPlugin = {
    finishAttachmentResourceBatch: vi.fn(async () => ({})),
    stageAttachmentResourceBatch: vi.fn(async () => ({ failed_attachment_ids: [], manifest: [] }))
  };
  const owner = { runWriter: vi.fn(async () => { throw new Error('shared commit failed'); }) } as never;

  await expect(commitStagedCompanionContentBatch(owner, contentPlugin as never, {
    batch_token: 'content-token', failed_hashes: [], pack_path: '/native/content.db', synced_hashes: []
  }, '2026-08-06T00:00:00.000Z')).rejects.toThrow('shared commit failed');
  await expect(commitStagedCompanionAttachmentBatch(
    owner, attachmentPlugin as never, 'attachment-token', '2026-08-06T00:00:00.000Z'
  )).rejects.toThrow('shared commit failed');

  expect(contentPlugin.finishContentBlobBatch).toHaveBeenCalledWith({ batch_token: 'content-token', committed: false });
  expect(attachmentPlugin.finishAttachmentResourceBatch).toHaveBeenCalledWith({
    batch_token: 'attachment-token', committed: false
  });
});

function fakeOwner() {
  const port = {
    query: vi.fn(async () => []),
    run: vi.fn(async () => ({ changes: 1, lastInsertRowId: null })),
    transaction: vi.fn(async <T>(task: (tx: DbPort) => Promise<T>) => task(port as DbPort))
  } as DbPort;
  return {
    owner: { runWriter: <T>(task: (db: DbPort) => Promise<T>) => task(port) } as never,
    port
  };
}
