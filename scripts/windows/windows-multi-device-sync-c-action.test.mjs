import { expect, it, vi } from 'vitest';

import { runWindowsMultiDeviceSyncC } from './windows-multi-device-sync-c-action.mjs';

const facts = { activeMemberCount: 3, contentBlobCount: 1, localMemberState: 'active',
  missingAttachmentCount: 0, missingContentBlobCount: 0, nodeCount: 1 };

it('resets only the owned C client and requires restart-stable ordinary sync facts', async () => {
  const runRecovery = vi.fn(async () => ({ output: 'complete', receipt: {
    firstFacts: facts, restartedFacts: facts
  }, syncGroupRecovery: { receiptPath: 'receipt.json' } }));
  await expect(runWindowsMultiDeviceSyncC({ execute: vi.fn(), paths: {}, runRecovery }))
    .resolves.toEqual({ multiDeviceSyncC: { manifestPath: 'receipt.json' }, output: 'complete' });
  expect(runRecovery).toHaveBeenCalledWith(expect.objectContaining({ resetOwnedState: true }));
});

it('rejects an ordinary sync result that does not contain all three members', async () => {
  const runRecovery = vi.fn(async () => ({ output: '', receipt: {
    firstFacts: { ...facts, activeMemberCount: 2 }, restartedFacts: facts
  }, syncGroupRecovery: { receiptPath: 'receipt.json' } }));
  await expect(runWindowsMultiDeviceSyncC({ runRecovery })).rejects.toThrow('formal sync is incomplete');
});
