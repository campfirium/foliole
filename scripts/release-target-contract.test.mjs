// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { validateReleaseTarget } from './release-target-contract.mjs';

const SHA = 'a'.repeat(40);
const BASE = {
  eventName: 'workflow_dispatch',
  headSha: SHA,
  packageVersion: '1.2.3',
  refName: 'release/1.2.3',
  runSha: SHA,
  targetSha: SHA,
  targetVersion: '1.2.3'
};

describe('release target contract', () => {
  it('accepts one explicit version and SHA across the run and checkout', () => {
    expect(validateReleaseTarget(BASE)).toEqual({ sha: SHA, version: '1.2.3' });
  });

  it('derives an automatic release candidate version from the pushed branch', () => {
    expect(validateReleaseTarget({
      ...BASE,
      eventName: 'push',
      targetVersion: ''
    })).toEqual({ sha: SHA, version: '1.2.3' });
  });

  it.each([
    ['missing version', { targetVersion: '' }, 'target_version is required'],
    ['invalid version', { targetVersion: 'release/1.2.3' }, 'valid explicit version'],
    ['missing SHA', { targetSha: '' }, 'target_sha is required'],
    ['short SHA', { targetSha: 'abc' }, '40-character commit SHA'],
    ['package mismatch', { packageVersion: '1.2.4' }, 'package.json version'],
    ['run mismatch', { runSha: 'b'.repeat(40) }, 'Workflow run SHA'],
    ['checkout mismatch', { headSha: 'b'.repeat(40) }, 'Checked-out HEAD']
  ])('rejects %s', (_label, overrides, message) => {
    expect(() => validateReleaseTarget({ ...BASE, ...overrides })).toThrow(message);
  });

  it('rejects an automatic candidate run outside a release branch', () => {
    expect(() => validateReleaseTarget({
      ...BASE,
      eventName: 'push',
      refName: 'dev',
      targetVersion: ''
    })).toThrow('release/<version>');
  });
});
