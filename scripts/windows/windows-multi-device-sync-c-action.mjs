function assertFormalFacts(facts, localFact) {
  const localMaterialReady = facts.facts?.[localFact?.factId] === true
    && facts.attachmentIds?.includes(localFact?.attachmentId)
    && facts.availableAttachmentIds?.includes(localFact?.attachmentId);
  if (facts.activeMemberCount !== 3 || facts.localMemberState !== 'active'
      || facts.nodeCount === 0 || facts.contentBlobCount === 0
      || facts.missingAttachmentCount !== 0 || facts.missingContentBlobCount !== 0
      || !localMaterialReady) {
    throw new Error(`Windows C formal sync is incomplete: ${JSON.stringify(facts)}`);
  }
}

export async function runWindowsMultiDeviceSyncC({
  runRecovery, ...options
}) {
  const recovery = runRecovery
    ?? (await import('./windows-sync-group-recovery-action.mjs')).runWindowsSyncGroupRecovery;
  const result = await recovery({ ...options, resetOwnedState: true, seedOwnedState: true });
  assertFormalFacts(result.receipt.firstFacts, result.receipt.localFact);
  assertFormalFacts(result.receipt.restartedFacts, result.receipt.localFact);
  return {
    multiDeviceSyncC: { manifestPath: result.syncGroupRecovery.receiptPath },
    output: result.output
  };
}
