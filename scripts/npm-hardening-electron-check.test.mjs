// @vitest-environment node

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { evaluateLockedElectron } from './npm-hardening-electron-check.mjs';

const VERSION = '43.5.0';
const npmMetadata = { time: { [VERSION]: '2026-08-31T00:00:00.000Z' } };
const stableContext = {
  officialStableVersions: ['43.4.1', VERSION],
  stableVersionsComplete: true
};
const securityAdvisory = {
  fixedVersions: [VERSION],
  id: 'GHSA-electron-example',
  packageName: 'electron',
  source: 'github-advisory-database',
  verified: true
};

describe('locked Electron hardening contract', () => {
  it('accepts the exact locked minor version at the 4 hour boundary', () => {
    expect(evaluateLockedElectron({
      ...stableContext,
      now: '2026-08-31T04:00:00.000Z',
      npmMetadata,
      version: VERSION
    })).toMatchObject({ classification: 'eligible', reason: 'minimum-age-met', releaseType: 'minor' });
  });

  it('retains the 24 hour boundary for a locked major version', () => {
    expect(evaluateLockedElectron({
      now: '2026-08-31T23:59:59.999Z',
      npmMetadata: { time: { '44.0.0': '2026-08-31T00:00:00.000Z' } },
      officialStableVersions: ['43.4.1', '44.0.0'],
      stableVersionsComplete: true,
      version: '44.0.0'
    }).classification).toBe('deferred');
  });

  it('fails closed when exact version time metadata is missing or immature', () => {
    expect(evaluateLockedElectron({
      ...stableContext,
      now: '2026-08-31T03:59:59.999Z',
      npmMetadata,
      version: VERSION
    }).classification).toBe('deferred');
    expect(evaluateLockedElectron({
      ...stableContext,
      now: '2026-08-31T04:00:00.000Z',
      npmMetadata: { time: {} },
      version: VERSION
    }).classification).toBe('source-error');
  });

  it('accepts only explicit verified advisory evidence for an immature version', () => {
    expect(evaluateLockedElectron({
      ...stableContext,
      now: '2026-08-31T01:00:00.000Z',
      npmMetadata,
      securityAdvisory,
      version: VERSION
    })).toMatchObject({ classification: 'eligible', reason: 'verified-security-advisory' });
  });

  it('keeps seven-day defaults and exposes only the explicit advisory argument', () => {
    const npmrc = readFileSync('.npmrc', 'utf8').trim().split(/\r?\n/u);
    const hardening = readFileSync('scripts/npm-hardening-check.sh', 'utf8');
    const workflow = readFileSync('.github/workflows/hosted-quality-dependency-hardening.yml', 'utf8');
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

    expect(npmrc).toContain('min-release-age=7');
    expect(npmrc.filter((line) => line.startsWith('min-release-age-exclude[]='))).toEqual([
      'min-release-age-exclude[]=electron'
    ]);
    expect(hardening).toContain('node scripts/npm-hardening-electron-check.mjs "$@"');
    expect(hardening).toContain('an unrelated exclusion did not exempt recent electron@');
    expect(hardening).toContain('named exclusion allowed recent direct electron@');
    expect(hardening).not.toMatch(/ADVISORY.*:-/u);
    expect(workflow).toMatch(/Run dependency hardening checks\s+env:\s+GH_TOKEN: \$\{\{ github\.token \}\}/u);
    expect(packageJson.scripts['deps:hardening:check']).toContain('bash scripts/npm-hardening-check.sh');
  });
});
