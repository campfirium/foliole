import {
  parseLatestPairSyncAndroidEvidence, validatePairSyncAndroidEvidence
} from './windows-a5-pair-sync-recovery-android-evidence.mjs';
import {
  createPairSyncApprovalEvidence, validatePairSyncApprovalEvidence
} from './windows-a5-pair-sync-recovery-approval-evidence.mjs';

export function validatePairSyncRecoveryResult({ android, approval }) {
  const safeAndroid = validatePairSyncAndroidEvidence(android);
  const safeApproval = validatePairSyncApprovalEvidence(approval);
  if (!safeApproval.pending_observed || !safeApproval.approve_invoked || !safeApproval.approve_succeeded
      || safeAndroid.completion !== 'http_200'
      || safeAndroid.credentials !== 'saved_signable'
      || safeAndroid.initialSync !== 'completed') {
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

export function createPairSyncRecoveryEvidenceTracker() {
  const approval = createPairSyncApprovalEvidence();
  return {
    async approve(session, pending) {
      approval.markPendingObserved();
      approval.markApproveInvoked();
      await session.approve(pending.pair_request_id);
      approval.markApproveSucceeded();
    },
    complete(receipt) {
      const result = validatePairSyncRecoveryResult({ android: receipt, approval: approval.snapshot() });
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
