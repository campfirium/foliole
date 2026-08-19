import { expect, it } from 'vitest';

import { applySyncObjectPayloadWithDbPort } from '../lib/core/sync/syncObjectPayloadExecutor.ts';
import {
  SYNC_PACK_PAYLOAD_OBJECT_TYPES,
  isSyncPackPayloadObjectType,
} from '../lib/core/sync/syncPackManifest.ts';
import { SYNC_OBJECT_POLICIES } from '../lib/core/sync/syncObjectPolicy.ts';

function createRecordingPort() {
  const runs = [];
  const port = {
    query: async () => [],
    run: async (sql, params) => {
      runs.push({ params, sql });
      return { changes: 1, lastInsertRowId: null };
    },
    transaction: async (execute) => execute(port)
  };
  return { port, runs };
}

function pdfPageTextRecord(input = {}) {
  return {
    content_hash: 'hash-pdf-page',
    deleted_at: null,
    object_id: 'pdf-1:2',
    object_type: 'pdf_page_text',
    payload_json: JSON.stringify({
      attachment_id: 'pdf-1',
      page: 2,
      page_height: 1200,
      page_width: 800,
      text: 'Page text'
    }),
    updated_at: '2026-05-26T00:00:00.000Z',
    ...input
  };
}

it('keeps PDF page text classified as workspace sync content', () => {
  expect(SYNC_OBJECT_POLICIES).toContainEqual({
    category: 'content',
    conflict: 'lww',
    scope: 'workspace',
    key: 'pdf_page_text',
    objectType: 'pdf_page_text',
    pushIssue: 'review_required',
    storage: ['pdf_page_text'],
    userVisible: true
  });
  expect([...SYNC_PACK_PAYLOAD_OBJECT_TYPES]).toContain('pdf_page_text');
  expect(isSyncPackPayloadObjectType('pdf_page_text')).toBe(true);
});

it('applies PDF page text payloads and tombstones as page facts', async () => {
  const upsert = createRecordingPort();
  await applySyncObjectPayloadWithDbPort(upsert.port, pdfPageTextRecord());
  expect(upsert.runs).toEqual([{
    params: ['pdf-1', 2, 'Page text', 800, 1200],
    sql: expect.stringContaining('INSERT INTO pdf_page_text')
  }]);

  const tombstone = createRecordingPort();
  await applySyncObjectPayloadWithDbPort(tombstone.port, pdfPageTextRecord({
    deleted_at: '2026-05-26T00:01:00.000Z',
    payload_json: JSON.stringify({ attachment_id: 'pdf-1', page: 2 })
  }));
  expect(tombstone.runs).toEqual([{
    params: ['pdf-1', 2],
    sql: 'DELETE FROM pdf_page_text WHERE attachment_id = ? AND page = ?'
  }]);
});
