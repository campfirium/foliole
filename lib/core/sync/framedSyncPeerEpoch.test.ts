import { expect, it, vi } from 'vitest';

import type { DbPort } from './dbPort.js';
import { recordFramedSyncPeerEpoch } from './framedSyncPeerEpoch.js';

const input = {
  groupId: 'group', libraryEpoch: 'epoch-a', peerDeviceId: 'peer',
  transferId: new Uint8Array(32).fill(7)
};

it('records a peer epoch only after a framed transfer is applied', async () => {
  const query = vi.fn().mockResolvedValueOnce([]);
  const run = vi.fn().mockResolvedValue(undefined);
  await recordFramedSyncPeerEpoch({ query, run } as unknown as DbPort, input);

  expect(run).toHaveBeenCalledWith(expect.stringContaining('proof_revision, pack_id'), [
    'group', 'peer', 'epoch-a', 0, '07'.repeat(32), expect.any(String)
  ]);
});

it('preserves an existing delivery proof instead of weakening it', async () => {
  const query = vi.fn().mockResolvedValueOnce([{ library_epoch: 'epoch-a', proof_revision: 7 }]);
  const run = vi.fn();
  await recordFramedSyncPeerEpoch({ query, run } as unknown as DbPort, input);

  expect(run).not.toHaveBeenCalled();
});
