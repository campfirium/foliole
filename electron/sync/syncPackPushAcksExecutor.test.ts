import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { clearConfirmedSyncPushAcksWithDbPort } from '../../lib/core/sync/syncPackPushAcksExecutor.js';

it('clears confirmed push acks using the attached pack and to-state cursor', async () => {
  const port = {
    run: vi.fn(async () => ({ changes: 1, lastInsertRowId: null }))
  } as unknown as DbPort;

  await clearConfirmedSyncPushAcksWithDbPort(port, {
    incomingAlias: 'incoming',
    toStateSeq: 12
  });

  expect(port.run).toHaveBeenNthCalledWith(1, expect.stringContaining('JOIN incoming.sync_object_state incoming'));
  expect(port.run).toHaveBeenNthCalledWith(2, expect.stringContaining("ack.status IN ('accepted', 'already_applied')"), [12]);
  expect(port.run).toHaveBeenNthCalledWith(3, expect.stringContaining('DELETE FROM sync_push_ack'));
});
