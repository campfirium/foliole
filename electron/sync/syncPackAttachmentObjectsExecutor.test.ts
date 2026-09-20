import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackAttachmentObjectsWithDbPort } from '../../lib/core/sync/syncPackAttachmentObjectsExecutor.js';

it('applies attachment parents before earlier pdf page text records', async () => {
  const contentHash = 'a'.repeat(64);
  const runs: Array<{ params: unknown[]; sql: string }> = [];
  const port = {
    query: vi.fn(async () => [
      {
        content_hash: 'hash-page',
        deleted_at: null,
        object_id: `${contentHash}:page:3`,
        object_type: 'pdf_page_text',
        payload_json: JSON.stringify({ attachment_id: contentHash, page: 3, text: 'page text' }),
        updated_at: '2026-05-04T05:01:00.000Z'
      },
      {
        content_hash: 'hash-attachment',
        deleted_at: null,
        object_id: contentHash,
        object_type: 'attachment',
        payload_json: JSON.stringify({
          attachment_id: contentHash,
          mime_type: 'application/pdf',
          original_name: 'doc.pdf',
          size_bytes: 128
        }),
        updated_at: '2026-05-04T05:00:00.000Z'
      }
    ]),
    run: vi.fn(async (sql: string, params: unknown[] = []) => {
      runs.push({ params, sql });
      return { changes: 1, lastInsertRowId: null };
    })
  } as unknown as DbPort;

  await expect(applySyncPackAttachmentObjectsWithDbPort(port, {
    incomingAlias: 'incoming'
  })).resolves.toBe(2);
  expect(runs[0]?.sql).toContain('INSERT INTO attachments');
  expect(runs[0]?.params.slice(0, 4)).toEqual([contentHash, 'doc.pdf', 'application/pdf', 128]);
  expect(runs[1]?.sql).toContain('INSERT INTO pdf_page_text');
  expect(runs[1]?.params.slice(0, 3)).toEqual([contentHash, 3, 'page text']);
});

it('deletes attachment payload rows for tombstones', async () => {
  const contentHash = 'a'.repeat(64);
  const runs: string[] = [];
  const port = {
    query: vi.fn(async () => [{
      content_hash: 'hash-attachment',
      deleted_at: '2026-05-04T05:00:00.000Z',
      object_id: contentHash,
      object_type: 'attachment',
      payload_json: null,
      updated_at: '2026-05-04T05:00:00.000Z'
    }]),
    run: vi.fn(async (sql: string) => {
      runs.push(sql);
      return { changes: 1, lastInsertRowId: null };
    })
  } as unknown as DbPort;

  await expect(applySyncPackAttachmentObjectsWithDbPort(port, {
    incomingAlias: 'incoming'
  })).resolves.toBe(1);
  expect(runs).toEqual([
    'DELETE FROM pdf_page_text WHERE attachment_id = ?',
    'DELETE FROM node_attachments WHERE attachment_id = ?',
    'DELETE FROM attachments WHERE id = ?'
  ]);
});
