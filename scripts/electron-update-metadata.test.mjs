// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  readLatestElectronEligibilityInput,
  readVerifiedElectronSecurityAdvisory
} from './electron-update-metadata.mjs';

describe('Electron official metadata adapters', () => {
  it('maps GitHub latest stable and npm exact publish time without a local clock', () => {
    const runGh = vi.fn(() => ({ draft: false, prerelease: false, tag_name: 'v43.5.0' }));
    const runNpm = vi.fn(() => ({
      'dist-tags': { latest: '43.5.0' },
      time: { '43.5.0': '2026-08-31T00:00:00.000Z' }
    }));

    expect(readLatestElectronEligibilityInput({
      now: '2026-09-01T00:00:00.000Z',
      runGh,
      runNpm
    })).toEqual({
      githubRelease: { isDraft: false, isPrerelease: false, tagName: 'v43.5.0' },
      now: '2026-09-01T00:00:00.000Z',
      npmMetadata: { latest: '43.5.0', publishedAt: '2026-08-31T00:00:00.000Z' }
    });
  });

  it('accepts a named official advisory only when it proves Electron is fixed', () => {
    const runGh = vi.fn(() => ({
      ghsa_id: 'GHSA-electron-example',
      vulnerabilities: [{
        first_patched_version: '43.5.0',
        package: { ecosystem: 'npm', name: 'electron' }
      }],
      withdrawn_at: null
    }));
    expect(readVerifiedElectronSecurityAdvisory({
      advisoryId: 'GHSA-electron-example',
      runGh,
      version: '43.5.0'
    })).toMatchObject({ fixedVersions: ['43.5.0'], packageName: 'electron', verified: true });

    expect(() => readVerifiedElectronSecurityAdvisory({
      advisoryId: 'GHSA-electron-example',
      runGh,
      version: '43.5.1'
    })).toThrow('does not verify Electron 43.5.1 as fixed');
  });
});
