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
  it('uses an exact deterministic 24 hour boundary', () => {
    expect(eligibility({ now: fixture.clock.beforeBoundary })).toMatchObject({
      classification: 'deferred',
      eligibleAt: fixture.clock.exactBoundary,
      version: '43.5.0'
    });
    expect(eligibility()).toMatchObject({ classification: 'eligible', reason: 'minimum-age-met' });
  });

  it.each([
    ['draft release', { githubRelease: { ...fixture.release.githubRelease, isDraft: true } }],
    ['prerelease', { githubRelease: { ...fixture.release.githubRelease, isPrerelease: true } }],
    ['version mismatch', { npmMetadata: { ...fixture.release.npmMetadata, latest: '43.4.1' } }],
    ['missing GitHub source', { githubRelease: null }],
    ['unparseable npm time', { npmMetadata: { ...fixture.release.npmMetadata, publishedAt: 'yesterday' } }]
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

  it('has no production consumer during the prepare closure', () => {
    for (const file of ['github-desktop-handoff-events.mjs', 'github-desktop-handoff-monitor.mjs', 'npm-hardening-check.sh']) {
      expect(readFileSync(new URL(file, import.meta.url), 'utf8')).not.toContain('electron-update-eligibility');
    }
  });
});
