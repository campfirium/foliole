import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackAttachmentObjectsWithDbPort } from '../../lib/core/sync/syncPackAttachmentObjectsExecutor.js';

it('applies attachment and pdf page text payload records', async () => {
  const runs: Array<{ params: unknown[]; sql: string }> = [];
  const port = {
    query: vi.fn(async () => [
      {
        content_hash: 'hash-attachment',
        deleted_at: null,
        object_id: 'att-1',
        object_type: 'attachment',
        payload_json: JSON.stringify({
          blob: { availability: 'local', content_hash: 'blob-hash', size_bytes: 128 },
          mime_type: 'application/pdf',
          original_name: 'doc.pdf',
          size_bytes: 128
        }),
        updated_at: '2026-05-04T05:00:00.000Z'
      },
      {
        content_hash: 'hash-page',
        deleted_at: null,
        object_id: 'att-1:page:3',
        object_type: 'pdf_page_text',
        payload_json: JSON.stringify({ attachment_id: 'att-1', page: 3, text: 'page text' }),
        updated_at: '2026-05-04T05:01:00.000Z'
      }
    ]),
    run: vi.fn(async (sql: string, params: unknown[] = []) => {
      runs.push({ params, sql });
      return { changes: 1, lastInsertRowId: null };
    })
  } as unknown as DbPort;

  await expect(applySyncPackAttachmentObjectsWithDbPort(port, {
    deviceId: 'device-1',
    incomingAlias: 'incoming'
  })).resolves.toBe(2);
  expect(runs[0]?.sql).toContain('INSERT INTO attachments');
  expect(runs[0]?.params.slice(0, 4)).toEqual(['att-1', 'doc.pdf', 'application/pdf', 128]);
  expect(runs[1]?.sql).toContain('INSERT INTO attachment_blobs');
  expect(runs[1]?.params.slice(0, 6)).toEqual(['att-1', 'blob-hash', null, 128, null, 'remote_known']);
  expect(runs[2]?.sql).toContain('INSERT INTO pdf_page_text');
  expect(runs[2]?.params.slice(0, 3)).toEqual(['att-1', 3, 'page text']);
});

it('deletes attachment payload rows for tombstones', async () => {
  const runs: string[] = [];
  const port = {
    query: vi.fn(async () => [{
      content_hash: 'hash-attachment',
      deleted_at: '2026-05-04T05:00:00.000Z',
      object_id: 'att-1',
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
    deviceId: 'device-1',
    incomingAlias: 'incoming'
  })).resolves.toBe(1);
  expect(runs).toEqual([
    'DELETE FROM pdf_page_text WHERE attachment_id = ?',
    'DELETE FROM attachment_blobs WHERE attachment_id = ?',
    'DELETE FROM attachments WHERE id = ?'
  ]);
});
