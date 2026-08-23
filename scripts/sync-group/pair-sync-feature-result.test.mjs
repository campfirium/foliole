// @vitest-environment node

import { expect, it } from 'vitest';

import { validatePairSyncRecoveryResult } from './pair-sync-feature-result.mjs';

const approval = Object.freeze({
  approve_invoked: true, approve_succeeded: true, pending_observed: true
});
const credentials = Object.freeze({
  completion: 'http_200', credentials: 'saved_signable', initialSync: 'not_started'
});

it('accepts only a newly approved signable-credential feature result', () => {
  expect(validatePairSyncRecoveryResult({
    android: credentials, approval, pairingPath: 'new'
  })).toEqual({ android: credentials, approval });
});

it.each([
  ['existing mixed path', { pairingPath: 'existing' }],
  ['initial sync result', { android: { ...credentials, initialSync: 'completed' } }],
  ['missing approval', { approval: {
    approve_invoked: false, approve_succeeded: false, pending_observed: false
  } }]
])('rejects %s as credential feature evidence', (_label, override) => {
  expect(() => validatePairSyncRecoveryResult({
    android: credentials, approval, pairingPath: 'new', ...override
  })).toThrow();
});
