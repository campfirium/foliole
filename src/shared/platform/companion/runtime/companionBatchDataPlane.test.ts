import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import {
  commitStagedCompanionAttachmentBatch
} from './companionBatchDataPlane';

it('stages native attachment files and commits only their small manifest', async () => {
  const { owner, port } = fakeOwner();
  const attachmentId = 'b'.repeat(64);
  const plugin = {
    finishAttachmentResourceBatch: vi.fn(async () => ({})),
    stageAttachmentResourceBatch: vi.fn(async () => ({
      failed_attachment_ids: [],
      manifest: [{
        attachment_id: attachmentId, content_hash: attachmentId, mime_type: 'image/png',
        size_bytes: 32_600_000, storage_key: `${attachmentId}.png`
      }]
    }))
  };

  await expect(commitStagedCompanionAttachmentBatch(
    owner, plugin as never, 'attachment-token', '2026-08-06T00:00:00.000Z'
  )).resolves.toEqual({ failedIds: [], syncedIds: [attachmentId] });

  expect(plugin.stageAttachmentResourceBatch).toHaveBeenCalledWith({ batch_token: 'attachment-token' });
  expect(plugin.finishAttachmentResourceBatch).toHaveBeenCalledWith({ batch_token: 'attachment-token', committed: true });
  expect(port.query).not.toHaveBeenCalled();
  expect(port.run).not.toHaveBeenCalled();
});

it('reports failed shared commits so native staging can roll back', async () => {
  const attachmentPlugin = {
    finishAttachmentResourceBatch: vi.fn(async () => ({})),
    stageAttachmentResourceBatch: vi.fn(async () => ({ failed_attachment_ids: [], manifest: [] }))
  };
  const owner = { runWriter: vi.fn(async () => { throw new Error('shared commit failed'); }) } as never;

  await expect(commitStagedCompanionAttachmentBatch(
    owner, attachmentPlugin as never, 'attachment-token', '2026-08-06T00:00:00.000Z'
  )).rejects.toThrow('shared commit failed');

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
