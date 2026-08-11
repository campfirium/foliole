function assertFormalFacts(facts) {
  if (facts.activeMemberCount !== 3 || facts.localMemberState !== 'active'
      || facts.nodeCount === 0 || facts.contentBlobCount === 0
      || facts.missingAttachmentCount !== 0 || facts.missingContentBlobCount !== 0) {
    throw new Error(`Windows C formal sync is incomplete: ${JSON.stringify(facts)}`);
  }
}

export async function runWindowsMultiDeviceSyncC({
  runRecovery, ...options
}) {
  const recovery = runRecovery
    ?? (await import('./windows-sync-group-recovery-action.mjs')).runWindowsSyncGroupRecovery;
  const result = await recovery({ ...options, resetOwnedState: true });
  assertFormalFacts(result.receipt.firstFacts);
  assertFormalFacts(result.receipt.restartedFacts);
  return {
    multiDeviceSyncC: { manifestPath: result.syncGroupRecovery.receiptPath },
    output: result.output
  };
}
