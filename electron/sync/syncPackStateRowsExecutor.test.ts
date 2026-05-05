import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackStateRowsWithDbPort } from '../../lib/core/sync/syncPackStateRowsExecutor.js';

it('writes clean local state rows from applyable sync pack rows', async () => {
  const port = createPort();

  await expect(applySyncPackStateRowsWithDbPort(port, {
    deviceId: 'android-device',
    incomingAlias: 'incoming',
    objectTypes: ['node', 'setting']
  })).resolves.toBe(2);

  expect(port.query).toHaveBeenCalledWith('SELECT COALESCE(MAX(state_seq), 0) + 1 AS next_state_seq FROM sync_object_state');
  expect(port.query).toHaveBeenCalledWith(expect.stringContaining('WHERE object_type IN (?, ?)'), ['node', 'setting']);
  expect(port.run).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining('INSERT OR REPLACE INTO sync_object_state'),
    ['node', 'node-1', 8, 'desktop#1', 'hash-node', 'android-device', '2026-05-04T01:00:00.000Z', null]
  );
  expect(port.run).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('INSERT OR REPLACE INTO sync_object_state'),
    ['setting', 'setting-1', 9, null, 'hash-setting', 'android-device', '2026-05-04T01:01:00.000Z', null]
  );
});

function createPort(): DbPort {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('MAX(state_seq)')) return [{ next_state_seq: 8 }];
      return [
        stateRow('node', 'node-1', 'hash-node', 'desktop#1', '2026-05-04T01:00:00.000Z'),
        stateRow('setting', 'setting-1', 'hash-setting', null, '2026-05-04T01:01:00.000Z')
      ];
    }),
    run: vi.fn(async () => ({ changes: 1, lastInsertRowId: null })),
    transaction: vi.fn()
  } as never;
}

function stateRow(
  objectType: string,
  objectId: string,
  contentHash: string,
  currentVersionId: string | null,
  updatedAt: string
) {
  return {
    content_hash: contentHash,
    current_version_id: currentVersionId,
    deleted_at: null,
    object_id: objectId,
    object_type: objectType,
    updated_at: updatedAt
  };
}
