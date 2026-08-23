import {
  parseLatestPairSyncAndroidEvidence, validatePairSyncAndroidEvidence
} from './pair-sync-android-evidence.mjs';
import {
  createPairSyncApprovalEvidence, validatePairSyncApprovalEvidence
} from './pair-sync-approval-evidence.mjs';

export function validatePairSyncRecoveryResult({
  android, approval, evidenceGoal = 'credentials-signable', pairingPath
}) {
  const safeAndroid = validatePairSyncAndroidEvidence(android);
  const safeApproval = validatePairSyncApprovalEvidence(approval);
  const approvalComplete = safeApproval.pending_observed
    && safeApproval.approve_invoked && safeApproval.approve_succeeded;
  const pathComplete = pairingPath === 'new'
    && approvalComplete && safeAndroid.completion === 'http_200';
  const goalComplete = evidenceGoal === 'credentials-signable'
    && safeAndroid.initialSync === 'not_started';
  if (!pathComplete || safeAndroid.credentials !== 'saved_signable' || !goalComplete) {
    throw new Error('Pair sync recovery evidence did not prove the ordered recovery result.');
  }
  return { android: safeAndroid, approval: safeApproval };
}

export function sanitizePairSyncRecoveryProgressEvidence({ android, approval } = {}) {
  let safeAndroid = null;
  try { safeAndroid = android ? validatePairSyncAndroidEvidence(android) : null; }
  catch { safeAndroid = null; }
  return { android: safeAndroid, approval: validatePairSyncApprovalEvidence(approval) };
}

export function createPairSyncRecoveryEvidenceTracker(evidenceGoal = 'credentials-signable') {
  const approval = createPairSyncApprovalEvidence();
  return {
    async approve(session, pending, membershipAction) {
      approval.markPendingObserved();
      approval.markApproveInvoked();
      await session.approve(pending.pair_request_id, membershipAction);
      approval.markApproveSucceeded();
    },
    complete(receipt) {
      const result = validatePairSyncRecoveryResult({
        android: receipt, approval: approval.snapshot(), evidenceGoal, pairingPath: receipt.pairingPath
      });
      return { ...receipt, approval: result.approval };
    },
    failure(error) {
      return {
        android: error.pairSyncAndroidEvidence
          ?? parseLatestPairSyncAndroidEvidence(error.result?.output),
        approval: approval.snapshot()
      };
    }
  };
}
