// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { evaluateLockedElectron } from './npm-hardening-electron-check.mjs';

const VERSION = '43.5.0';
const npmMetadata = { time: { [VERSION]: '2026-08-31T00:00:00.000Z' } };
const securityAdvisory = {
  fixedVersions: [VERSION],
  id: 'GHSA-electron-example',
  packageName: 'electron',
  source: 'github-advisory-database',
  verified: true
};

describe('locked Electron hardening contract', () => {
  it('accepts the exact locked version at the 24 hour boundary', () => {
    expect(evaluateLockedElectron({
      now: '2026-09-01T00:00:00.000Z',
      npmMetadata,
      version: VERSION
    })).toMatchObject({ classification: 'eligible', reason: 'minimum-age-met' });
  });

  it('fails closed when exact version time metadata is missing or immature', () => {
    expect(evaluateLockedElectron({
      now: '2026-08-31T23:59:59.999Z',
      npmMetadata,
      version: VERSION
    }).classification).toBe('deferred');
    expect(evaluateLockedElectron({
      now: '2026-09-01T00:00:00.000Z',
      npmMetadata: { time: {} },
      version: VERSION
    }).classification).toBe('source-error');
  });

  it('accepts only explicit verified advisory evidence for an immature version', () => {
    expect(evaluateLockedElectron({
      now: '2026-08-31T01:00:00.000Z',
      npmMetadata,
      securityAdvisory,
      version: VERSION
    })).toMatchObject({ classification: 'eligible', reason: 'verified-security-advisory' });
  });

  it('keeps seven-day defaults and exposes only the explicit advisory argument', () => {
    const npmrc = readFileSync('.npmrc', 'utf8').trim().split(/\r?\n/u);
    const hardening = readFileSync('scripts/npm-hardening-check.sh', 'utf8');
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

    expect(npmrc).toContain('min-release-age=7');
    expect(npmrc.filter((line) => line.startsWith('min-release-age-exclude[]='))).toEqual([
      'min-release-age-exclude[]=electron'
    ]);
    expect(hardening).toContain('node scripts/npm-hardening-electron-check.mjs "$@"');
    expect(hardening).toContain('an unrelated exclusion did not exempt recent electron@');
    expect(hardening).toContain('named exclusion allowed recent direct electron@');
    expect(hardening).not.toMatch(/ADVISORY.*:-/u);
    expect(packageJson.scripts['deps:hardening:check']).toContain('bash scripts/npm-hardening-check.sh');
  });
});
