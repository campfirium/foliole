// @vitest-environment node

import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { classifyElectronUpdateEligibility } from './electron-update-eligibility.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/electron-update-contract.json', import.meta.url), 'utf8'));

function eligibility(overrides = {}) {
  return classifyElectronUpdateEligibility({
    ...fixture.release,
    now: fixture.clock.exactBoundary,
    ...overrides
  });
}

describe('Electron update eligibility contract', () => {
  it('uses an exact deterministic 4 hour boundary for an upstream minor release', () => {
    expect(eligibility({ now: fixture.clock.beforeBoundary })).toMatchObject({
      classification: 'deferred',
      eligibleAt: fixture.clock.exactBoundary,
      previousVersion: '43.4.1',
      releaseType: 'minor',
      version: '43.5.0'
    });
    expect(eligibility()).toMatchObject({ classification: 'eligible', reason: 'minimum-age-met' });
  });

  it.each([
    ['major', '43.4.1', '44.0.0', '2026-08-31T23:59:59.999Z', '2026-09-01T00:00:00.000Z'],
    ['minor', '44.0.3', '44.1.0', '2026-08-31T03:59:59.999Z', '2026-08-31T04:00:00.000Z'],
    ['patch', '44.1.0', '44.1.1', '2026-08-31T03:59:59.999Z', '2026-08-31T04:00:00.000Z']
  ])('classifies an upstream %s release at its own boundary',
    (releaseType, previousVersion, version, beforeBoundary, exactBoundary) => {
      const input = {
        githubRelease: { isDraft: false, isPrerelease: false, tagName: `v${version}` },
        npmMetadata: { latest: version, publishedAt: '2026-08-31T00:00:00.000Z' },
        officialStableVersions: [previousVersion, version],
        stableVersionsComplete: true
      };
      expect(classifyElectronUpdateEligibility({ ...input, now: beforeBoundary }))
        .toMatchObject({ classification: 'deferred', previousVersion, releaseType, version });
      const result = classifyElectronUpdateEligibility({ ...input, now: exactBoundary });
      expect(result).toMatchObject({ classification: 'eligible', previousVersion, releaseType, version });
    });

  it('selects the greatest lower SemVer instead of a later old-major maintenance release', () => {
    expect(classifyElectronUpdateEligibility({
      githubRelease: { isDraft: false, isPrerelease: false, tagName: 'v44.1.1' },
      now: '2026-08-31T04:00:00.000Z',
      npmMetadata: { latest: '44.1.1', publishedAt: '2026-08-31T00:00:00.000Z' },
      officialStableVersions: ['43.9.9', '44.0.3', '44.1.0', '44.1.1'],
      stableVersionsComplete: true
    })).toMatchObject({ previousVersion: '44.1.0', releaseType: 'patch' });
  });

  it.each([
    ['draft release', { githubRelease: { ...fixture.release.githubRelease, isDraft: true } }],
    ['prerelease', { githubRelease: { ...fixture.release.githubRelease, isPrerelease: true } }],
    ['version mismatch', { npmMetadata: { ...fixture.release.npmMetadata, latest: '43.4.1' } }],
    ['missing GitHub source', { githubRelease: null }],
    ['unparseable npm time', { npmMetadata: { ...fixture.release.npmMetadata, publishedAt: 'yesterday' } }],
    ['incomplete stable versions', { stableVersionsComplete: false }],
    ['missing previous stable version', { officialStableVersions: ['43.5.0'] }],
    ['invalid stable version member', { officialStableVersions: ['43.4.1-beta.1', '43.5.0'] }]
  ])('fails closed on %s', (_label, overrides) => {
    expect(eligibility(overrides).classification).toBe('source-error');
  });

  it('allows named verified official security evidence to bypass time only', () => {
    expect(eligibility({
      now: fixture.clock.beforeBoundary,
      securityAdvisory: fixture.securityAdvisory
    })).toMatchObject({ classification: 'eligible', reason: 'verified-security-advisory' });
    expect(eligibility({
      githubRelease: { ...fixture.release.githubRelease, tagName: 'v43.5.1' },
      now: fixture.clock.beforeBoundary,
      securityAdvisory: fixture.securityAdvisory
    }).classification).toBe('source-error');
  });

  it('does not let ordinary stability metadata bypass the age window', () => {
    expect(eligibility({ now: fixture.clock.beforeBoundary, releaseNotesKind: 'stability' })).toMatchObject({
      classification: 'deferred',
      reason: 'minimum-age-pending'
    });
  });
});
