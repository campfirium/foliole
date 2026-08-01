// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  resolveDesktopUpdaterReleasePolicy,
  validatePublishedDesktopUpdaterPolicy
} from './desktop-update-release-policy.mjs';

function manifest(policy = {}) {
  return {
    desktopUpdater: {
      firstCapableVersion: null,
      manualUpgradeFrom: '0.7.0',
      verifiedBaselineVersion: null,
      ...policy
    },
    latest: '0.7.1',
    releases: [{ version: '0.7.1' }, { version: '0.7.0' }]
  };
}

describe('desktop updater release policy', () => {
  it('treats the first repaired release as a manual-upgrade baseline without a fake predecessor', () => {
    expect(resolveDesktopUpdaterReleasePolicy(manifest(), '0.7.2')).toEqual({
      baselineVersion: '',
      bootstrap: true
    });
  });

  it('routes later candidates through the latest verified public baseline', () => {
    const value = manifest({ firstCapableVersion: '0.7.2', verifiedBaselineVersion: '0.7.2' });
    value.latest = '0.7.2';
    value.releases.unshift({ version: '0.7.2' });
    expect(resolveDesktopUpdaterReleasePolicy(value, '0.7.3')).toEqual({
      baselineVersion: '0.7.2',
      bootstrap: false
    });
  });

  it('requires post-public metadata to name real ordered release baselines', () => {
    const value = manifest({ firstCapableVersion: '0.7.2', verifiedBaselineVersion: '0.7.3' });
    expect(() => validatePublishedDesktopUpdaterPolicy(value)).toThrow('public manifest releases');
  });

  it('accepts a published baseline when its capability versions are ordered', () => {
    const value = manifest({ firstCapableVersion: '0.7.1', verifiedBaselineVersion: '0.7.1' });
    expect(validatePublishedDesktopUpdaterPolicy(value)).toEqual({
      baselineVersion: '0.7.1',
      firstCapableVersion: '0.7.1'
    });
  });
});
