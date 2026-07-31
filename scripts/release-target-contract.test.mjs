// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { validateReleaseTarget } from './release-target-contract.mjs';

const SHA = 'a'.repeat(40);
const BASE = {
  headSha: SHA,
  packageVersion: '1.2.3',
  refName: 'release',
  runSha: SHA
};

describe('release target contract', () => {
  it('derives the version from exact release branch content and keeps SHA internal', () => {
    expect(validateReleaseTarget(BASE)).toEqual({ sha: SHA, version: '1.2.3' });
  });

  it.each([
    ['missing version', { packageVersion: '' }, 'package.json version is required'],
    ['invalid version', { packageVersion: 'release/1.2.3' }, 'valid release version'],
    ['missing run SHA', { runSha: '' }, 'workflow run SHA is required'],
    ['short run SHA', { runSha: 'abc' }, '40-character commit SHA'],
    ['checkout mismatch', { headSha: 'b'.repeat(40) }, 'workflow run SHA']
  ])('rejects %s', (_label, overrides, message) => {
    expect(() => validateReleaseTarget({ ...BASE, ...overrides })).toThrow(message);
  });

  it.each(['dev', 'release/1.2.3', 'refs/heads/release'])('rejects non-exact ref name %s', (refName) => {
    expect(() => validateReleaseTarget({ ...BASE, refName }))
      .toThrow('exact release branch');
  });
});
