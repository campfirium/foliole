// @vitest-environment node

import { expect, it } from 'vitest';

import {
  parseLatestPairSyncAndroidEvidence, validatePairSyncAndroidEvidence
} from './windows-a5-pair-sync-recovery-android-evidence.mjs';
import {
  createPairSyncApprovalEvidence, validatePairSyncApprovalEvidence
} from './windows-a5-pair-sync-recovery-approval-evidence.mjs';
import {
  createPairSyncRecoveryEvidenceTracker, validatePairSyncRecoveryResult
} from './windows-a5-pair-sync-recovery-result.mjs';

const completeAndroid = {
  completion: 'http_200', credentials: 'saved_signable', initialSync: 'completed'
};

it('preserves each desktop approval fact only after its prerequisite', () => {
  const evidence = createPairSyncApprovalEvidence();
  expect(() => evidence.markApproveInvoked()).toThrow('before a pending request');
  evidence.markPendingObserved();
  evidence.markApproveInvoked();
  evidence.markApproveSucceeded();
  expect(evidence.snapshot()).toEqual({
    approve_invoked: true, approve_succeeded: true, pending_observed: true
  });
  expect(() => validatePairSyncApprovalEvidence({ approve_succeeded: true }))
    .toThrow('out of order');
});

it('does not claim approval success when the product command rejects', async () => {
  const tracker = createPairSyncRecoveryEvidenceTracker();
  await expect(tracker.approve({
    approve: async () => { throw new Error('approve failed'); }
  }, { pair_request_id: 'not-exported' })).rejects.toThrow('approve failed');
  expect(tracker.failure(new Error('stopped')).approval).toEqual({
    approve_invoked: true, approve_succeeded: false, pending_observed: true
  });
});

it('accepts only closed Android enums and ordered persistent progress', () => {
  expect(validatePairSyncAndroidEvidence(completeAndroid)).toEqual(completeAndroid);
  expect(() => validatePairSyncAndroidEvidence({
    completion: 'dispatched', credentials: 'saved_signable', initialSync: 'completed'
  })).toThrow('contradictory');
  expect(() => validatePairSyncAndroidEvidence({
    completion: 'http_200', credentials: 'saved_not_signable', initialSync: 'completed'
  })).toThrow('contradictory');
  expect(() => validatePairSyncAndroidEvidence({
    completion: 'forged', credentials: 'not_saved', initialSync: 'not_started'
  })).toThrow('contradictory');
});

it('uses only the latest valid instrumentation bundle and fails unknown bundles closed', () => {
  const output = [
    'INSTRUMENTATION_STATUS: foliolePairSyncEvidence={"completion":"dispatched","credentials":"not_saved","initialSync":"not_started"}',
    `INSTRUMENTATION_STATUS: foliolePairSyncEvidence=${JSON.stringify(completeAndroid)}`
  ].join('\n');
  expect(parseLatestPairSyncAndroidEvidence(output)).toEqual(completeAndroid);
  expect(parseLatestPairSyncAndroidEvidence(output.replace('completed', 'forged'))).toBeNull();
});

it('requires matching desktop approval and Android terminal evidence', () => {
  const approval = { approve_invoked: true, approve_succeeded: true, pending_observed: true };
  expect(validatePairSyncRecoveryResult({ android: completeAndroid, approval, pairingPath: 'new' }))
    .toEqual({ android: completeAndroid, approval });
  expect(() => validatePairSyncRecoveryResult({
    android: completeAndroid, approval: { ...approval, approve_succeeded: false }, pairingPath: 'new'
  })).toThrow('did not prove');
  expect(() => validatePairSyncRecoveryResult({
    android: { ...completeAndroid, completion: 'dispatched', credentials: 'not_saved', initialSync: 'not_started' },
    approval, pairingPath: 'new'
  })).toThrow('did not prove');
});

it('proves matching existing pairing sync without inventing a new approval', () => {
  const android = {
    completion: 'existing_pairing', credentials: 'saved_signable', initialSync: 'completed'
  };
  const approval = { approve_invoked: false, approve_succeeded: false, pending_observed: false };
  expect(validatePairSyncRecoveryResult({ android, approval, pairingPath: 'existing' }))
    .toEqual({ android, approval });
  expect(() => validatePairSyncRecoveryResult({ android, approval, pairingPath: 'new' }))
    .toThrow('did not prove');
});
