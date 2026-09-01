// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  readElectronVersionEligibilityInput,
  readLatestElectronEligibilityInput,
  readVerifiedElectronSecurityAdvisory
} from './electron-update-metadata.mjs';

function release(tagName) {
  return { draft: false, prerelease: false, tag_name: `v${tagName}` };
}

function ref(tagName) {
  return { ref: `refs/tags/v${tagName}` };
}

function metadataRunner(overrides = {}) {
  return vi.fn((args) => {
    const endpoint = args.at(-1);
    if (endpoint === 'repos/electron/electron/releases/latest') return release('43.5.0');
    if (endpoint.includes('/git/matching-refs/tags/v43.')) {
      return overrides.pages ?? [[ref('43.4.1'), ref('43.5.0'), ref('43.5.0-beta.1')]];
    }
    if (endpoint === 'repos/electron/electron/releases/tags/v43.4.1') return release('43.4.1');
    if (endpoint === 'repos/electron/electron/releases/tags/v43.5.0') return release('43.5.0');
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  });
}

describe('Electron official metadata adapters', () => {
  it('maps GitHub latest stable and npm exact publish time without a local clock', () => {
    const runGh = metadataRunner();
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
      npmMetadata: { latest: '43.5.0', publishedAt: '2026-08-31T00:00:00.000Z' },
      officialStableVersions: ['43.4.1', '43.5.0'],
      previousVersion: '43.4.1',
      stableVersionsComplete: true
    });
  });

  it('proves a non-latest locked version without requiring it to equal npm latest', () => {
    const runNpm = vi.fn(() => ({
      'dist-tags': { latest: '43.5.1' },
      time: {
        '43.5.0': '2026-08-31T00:00:00.000Z',
        '43.5.1': '2026-09-01T00:00:00.000Z'
      }
    }));
    expect(readElectronVersionEligibilityInput({
      now: '2026-09-01T00:00:00.000Z',
      runGh: metadataRunner(),
      runNpm,
      version: '43.5.0'
    })).toMatchObject({
      npmMetadata: { latest: '43.5.1', publishedAt: '2026-08-31T00:00:00.000Z' },
      previousVersion: '43.4.1'
    });
  });

  it('fails closed when the official stable tag collection is incomplete', () => {
    expect(() => readLatestElectronEligibilityInput({
      now: '2026-09-01T00:00:00.000Z',
      runGh: metadataRunner({ pages: [] }),
      runNpm: () => ({
        'dist-tags': { latest: '43.5.0' },
        time: { '43.5.0': '2026-08-31T00:00:00.000Z' }
      })
    })).toThrow('stable tag collection is incomplete');
  });

  it('crosses to the greatest stable release in the preceding major for a new major target', () => {
    const runGh = vi.fn((args) => {
      const endpoint = args.at(-1);
      if (endpoint.includes('/git/matching-refs/tags/v44.')) return [[ref('44.0.0')]];
      if (endpoint.includes('/git/matching-refs/tags/v43.')) return [[ref('43.4.1'), ref('43.5.0')]];
      if (endpoint === 'repos/electron/electron/releases/tags/v43.5.0') return release('43.5.0');
      if (endpoint === 'repos/electron/electron/releases/tags/v44.0.0') return release('44.0.0');
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    });
    expect(readElectronVersionEligibilityInput({
      now: '2026-09-01T00:00:00.000Z',
      runGh,
      runNpm: () => ({
        'dist-tags': { latest: '44.0.0' },
        time: { '44.0.0': '2026-08-31T00:00:00.000Z' }
      }),
      version: '44.0.0'
    })).toMatchObject({ previousVersion: '43.5.0' });
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
