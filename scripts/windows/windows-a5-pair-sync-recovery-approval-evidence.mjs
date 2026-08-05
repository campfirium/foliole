const EMPTY_APPROVAL_EVIDENCE = Object.freeze({
  approve_invoked: false,
  approve_succeeded: false,
  pending_observed: false
});

export function createPairSyncApprovalEvidence() {
  let evidence = { ...EMPTY_APPROVAL_EVIDENCE };
  return {
    markApproveInvoked() {
      if (!evidence.pending_observed) throw new Error('Pair approval was invoked before a pending request was observed.');
      evidence = { ...evidence, approve_invoked: true };
    },
    markApproveSucceeded() {
      if (!evidence.approve_invoked) throw new Error('Pair approval succeeded before it was invoked.');
      evidence = { ...evidence, approve_succeeded: true };
    },
    markPendingObserved() {
      evidence = { ...evidence, pending_observed: true };
    },
    snapshot() {
      return { ...evidence };
    }
  };
}

export function validatePairSyncApprovalEvidence(value) {
  const evidence = {
    approve_invoked: value?.approve_invoked === true,
    approve_succeeded: value?.approve_succeeded === true,
    pending_observed: value?.pending_observed === true
  };
  if (evidence.approve_succeeded && !evidence.approve_invoked) {
    throw new Error('Pair approval evidence is out of order.');
  }
  if (evidence.approve_invoked && !evidence.pending_observed) {
    throw new Error('Pair approval evidence is out of order.');
  }
  return evidence;
}
