import {
  waitForWindowsSyncGroupProviderRelease
} from './windows-sync-group-provider-release.mjs';

function assertFormalFacts(facts, localFact) {
  const localMaterialReady = facts.facts?.[localFact?.factId] === true
    && facts.attachmentIds?.includes(localFact?.attachmentId)
    && facts.availableAttachmentIds?.includes(localFact?.attachmentId);
  const origins = new Set(Object.values(facts.journeyFacts ?? {}));
  if (facts.activeMemberCount !== 3 || facts.localMemberState !== 'active'
      || facts.nodeCount === 0 || facts.contentBlobCount === 0
      || facts.missingAttachmentCount !== 0 || facts.missingContentBlobCount !== 0
      || !origins.has('A') || !origins.has('B') || !localMaterialReady) {
    throw new Error(`Windows C formal sync is incomplete: ${JSON.stringify(facts)}`);
  }
}

export async function runWindowsMultiDeviceSyncC({
  runRecovery, waitForConsumerRelease = waitForWindowsSyncGroupProviderRelease, ...options
}) {
  const recovery = runRecovery
    ?? (await import('./windows-sync-group-recovery-action.mjs')).runWindowsSyncGroupRecovery;
  const result = await recovery({ ...options, requiredJourneyOrigins: ['A', 'B'],
    resetOwnedState: true, seedOwnedState: true, onRestartedReady: async (localFact) => {
      options.reportProgress?.({ factId: localFact.factId, milestone: 'c-provider-ready' });
      await waitForConsumerRelease({
        action: 'multi-device-sync-c', repoRoot: options.paths.repoRoot
      });
    } });
  assertFormalFacts(result.receipt.firstFacts, result.receipt.localFact);
  assertFormalFacts(result.receipt.restartedFacts, result.receipt.localFact);
  return {
    multiDeviceSyncC: { manifestPath: result.syncGroupRecovery.receiptPath },
    output: result.output
  };
}
