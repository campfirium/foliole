import { expect, it, vi } from 'vitest';

import { runWindowsMultiDeviceSyncC } from './windows-multi-device-sync-c-action.mjs';

const localFact = { attachmentId: 'hash-c', factId: 'multi-device-sync-c-1' };
const facts = { activeMemberCount: 3, attachmentIds: ['hash-c'], availableAttachmentIds: ['hash-c'],
  contentBlobCount: 1, facts: { 'multi-device-sync-c-1': true }, localMemberState: 'active',
  journeyFacts: { 'multi-device-sync-a-1': 'A', 'multi-device-sync-b-1': 'B',
    'multi-device-sync-c-1': 'C' }, missingAttachmentCount: 0, missingContentBlobCount: 0, nodeCount: 3 };

it('resets only the owned C client and requires restart-stable ordinary sync facts', async () => {
  const runRecovery = vi.fn(async () => ({ output: 'complete', receipt: {
    firstFacts: facts, localFact, restartedFacts: facts
  }, syncGroupRecovery: { receiptPath: 'receipt.json' } }));
  await expect(runWindowsMultiDeviceSyncC({ execute: vi.fn(), paths: {}, runRecovery }))
    .resolves.toEqual({ multiDeviceSyncC: { manifestPath: 'receipt.json' }, output: 'complete' });
  expect(runRecovery).toHaveBeenCalledWith(expect.objectContaining({
    requiredJourneyOrigins: ['A', 'B'], resetOwnedState: true, seedOwnedState: true
  }));
});

it('rejects an ordinary sync result that does not contain all three members', async () => {
  const runRecovery = vi.fn(async () => ({ output: '', receipt: {
    firstFacts: { ...facts, activeMemberCount: 2 }, localFact, restartedFacts: facts
  }, syncGroupRecovery: { receiptPath: 'receipt.json' } }));
  await expect(runWindowsMultiDeviceSyncC({ runRecovery })).rejects.toThrow('formal sync is incomplete');
});

it('rejects a joined C receipt that has not received both remote facts', async () => {
  const runRecovery = vi.fn(async () => ({ output: '', receipt: {
    firstFacts: { ...facts, journeyFacts: { 'multi-device-sync-a-1': 'A' } },
    localFact, restartedFacts: facts
  }, syncGroupRecovery: { receiptPath: 'receipt.json' } }));
  await expect(runWindowsMultiDeviceSyncC({ runRecovery })).rejects.toThrow('formal sync is incomplete');
});
