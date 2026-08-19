import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackStateRowsWithDbPort } from '../../lib/core/sync/syncPackStateRowsExecutor.js';

it('writes clean local state rows from applyable sync pack rows', async () => {
  const port = createPort();

  await expect(applySyncPackStateRowsWithDbPort(port, {
    incomingAlias: 'incoming',
    objectTypes: ['node', 'setting']
  })).resolves.toBe(2);

  expect(port.query).toHaveBeenCalledWith('SELECT COALESCE(MAX(state_seq), 0) + 1 AS next_state_seq FROM sync_object_state');
  expect(port.run).toHaveBeenCalledWith(
    expect.stringContaining('last_modified_by_host_name, updated_at, deleted_at, 0 FROM numbered'),
    ['node', 'setting', 8]
  );
  expect(port.query).toHaveBeenCalledWith(
    expect.stringContaining('SELECT COUNT(*) AS count'),
    ['node', 'setting']
  );
});

function createPort(): DbPort {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('MAX(state_seq)')) return [{ next_state_seq: 8 }];
      return [{ count: 2 }];
    }),
    run: vi.fn(async () => ({ changes: 1, lastInsertRowId: null })),
    transaction: vi.fn()
  } as never;
}
