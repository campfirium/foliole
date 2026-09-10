import { expect, it, vi } from 'vitest';

import { computeSyncContentHash } from '../database/syncState.js';

import type { DbPort } from './dbPort.js';
import { applyAttachmentObject } from './syncObjectAttachmentPayloadExecutor.js';

const tombstone = {
  attachment_id: 'attachment-1',
  content_hash: 'a'.repeat(64),
  mime_type: 'image/webp',
  storage_key: 'legacy-key'
};

function record(overrides: Record<string, unknown> = {}) {
  const deletedAt = '2026-09-10T01:02:03.000Z';
  return {
    content_hash: computeSyncContentHash('attachment', { ...tombstone, deleted_at: deletedAt }),
    deleted_at: deletedAt,
    object_id: tombstone.attachment_id,
    object_type: 'attachment',
    payload_json: JSON.stringify(tombstone),
    updated_at: deletedAt,
    ...overrides
  } as never;
}

it('persists attachment identity before deleting portable rows', async () => {
  const runs: Array<{ params: unknown[]; sql: string }> = [];
  const port = {
    query: vi.fn(async () => [{ content_hash: tombstone.content_hash,
      mime_type: tombstone.mime_type, storage_key: tombstone.storage_key }]),
    run: vi.fn(async (sql: string, params: unknown[] = []) => {
      runs.push({ params, sql });
      return { changes: 1, lastInsertRowId: null };
    })
  } as unknown as DbPort;

  await expect(applyAttachmentObject(port, record())).resolves.toBeUndefined();
  expect(runs[0]?.sql).toContain('INSERT INTO attachment_sync_tombstones');
  expect(runs[0]?.params.slice(0, 4)).toEqual([
    tombstone.attachment_id, tombstone.content_hash, tombstone.storage_key, tombstone.mime_type
  ]);
  expect(runs.slice(1).map((run) => run.sql)).toEqual([
    'DELETE FROM pdf_page_text WHERE attachment_id = ?',
    'DELETE FROM attachment_blobs WHERE attachment_id = ?',
    'DELETE FROM node_attachments WHERE attachment_id = ?',
    'DELETE FROM attachments WHERE id = ?'
  ]);
});

it('rejects an attachment tombstone whose resource identity drifted', async () => {
  const port = {
    query: vi.fn(async () => [{ ...tombstone, content_hash: 'b'.repeat(64) }]),
    run: vi.fn()
  } as unknown as DbPort;
  await expect(applyAttachmentObject(port, record())).rejects.toThrow('does not match');
  expect(port.run).not.toHaveBeenCalled();
});

it('does not resurrect an attachment after its identity tombstone exists', async () => {
  const port = {
    query: vi.fn(async () => [{ attachment_id: tombstone.attachment_id }]),
    run: vi.fn()
  } as unknown as DbPort;
  await expect(applyAttachmentObject(port, record({ deleted_at: null, payload_json: JSON.stringify({}) })))
    .resolves.toBe(false);
  expect(port.run).not.toHaveBeenCalled();
});
