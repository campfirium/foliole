import { expect, it, vi } from 'vitest';

import { runWindowsMultiDeviceSyncC } from './windows-multi-device-sync-c-action.mjs';

const localFact = { attachmentId: 'hash-c', factId: 'multi-device-sync-c-1' };
const facts = { activeMemberCount: 3, attachmentIds: ['hash-c'], cachedAttachmentIds: ['hash-c'],
  contentBlobCount: 1, facts: { 'multi-device-sync-c-1': true }, localMemberState: 'active',
  missingAttachmentCount: 0, missingContentBlobCount: 0, nodeCount: 1 };

it('resets only the owned C client and requires restart-stable ordinary sync facts', async () => {
  const runRecovery = vi.fn(async () => ({ output: 'complete', receipt: {
    firstFacts: facts, localFact, restartedFacts: facts
  }, syncGroupRecovery: { receiptPath: 'receipt.json' } }));
  await expect(runWindowsMultiDeviceSyncC({ execute: vi.fn(), paths: {}, runRecovery }))
    .resolves.toEqual({ multiDeviceSyncC: { manifestPath: 'receipt.json' }, output: 'complete' });
  expect(runRecovery).toHaveBeenCalledWith(expect.objectContaining({
    resetOwnedState: true, seedOwnedState: true
  }));
});

it('rejects an ordinary sync result that does not contain all three members', async () => {
  const runRecovery = vi.fn(async () => ({ output: '', receipt: {
    firstFacts: { ...facts, activeMemberCount: 2 }, localFact, restartedFacts: facts
  }, syncGroupRecovery: { receiptPath: 'receipt.json' } }));
  await expect(runWindowsMultiDeviceSyncC({ runRecovery })).rejects.toThrow('formal sync is incomplete');
});
