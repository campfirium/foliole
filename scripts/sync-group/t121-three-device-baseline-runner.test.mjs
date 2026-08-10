import { expect, it } from 'vitest';

import {
  assertBaselineAuthorization, createBaselineAuthorizationRequest
} from './t121-three-device-baseline-runner.mjs';

const candidate = { branch: 'dev', clean: true, committed: true, revision: 'a'.repeat(40),
  treeDigest: 'tree-1', verifications: [{ status: 'passed' }] };

it('binds the exact three-device mutation disclosure to the frozen candidate', () => {
  const request = createBaselineAuthorizationRequest(candidate);
  expect(request.mutations.map(({ device }) => device)).toEqual(['A', 'B', 'C']);
  expect(() => assertBaselineAuthorization(request, candidate, request.authorizationDigest))
    .not.toThrow();
});

it('rejects a reused authorization after the revision, tree, or mutation boundary changes', () => {
  const request = createBaselineAuthorizationRequest(candidate);
  expect(() => assertBaselineAuthorization(request, { ...candidate, treeDigest: 'tree-2' },
    request.authorizationDigest)).toThrow('does not match');
  request.mutations[2].effect = 'changed';
  expect(() => assertBaselineAuthorization(request, candidate, request.authorizationDigest))
    .toThrow('does not match');
});
