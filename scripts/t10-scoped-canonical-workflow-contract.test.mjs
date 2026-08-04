// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import packageJson from '../package.json' with { type: 'json' };

import { SHARED_TEST_BUCKETS } from './run-shared-test-bucket.mjs';

const read = (file) => fs.readFileSync(file, 'utf8');
const workflow = (name) => parse(read(`.github/workflows/${name}`));
const android = workflow('hosted-quality-android.yml');
const core = workflow('hosted-quality-core.yml');
const full = workflow('hosted-quality-full.yml');
const ios = workflow('hosted-quality-ios.yml');
const shared = workflow('hosted-quality-shared.yml');
const t5 = workflow('t5-baseline-admission.yml');
const TEST_PATTERN = /\.test\.(?:mjs|mts|ts|tsx)$/u;

function collectTests(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectTests(entryPath));
    else if (TEST_PATTERN.test(entry.name)) files.push(entryPath.replaceAll('\\', '/'));
  }
  return files.sort();
}

function sharedFiles() {
  return SHARED_TEST_BUCKETS.flatMap(({ targets }) => targets.flatMap((target) => {
    if (target.startsWith('--exclude=')) return [];
    return fs.statSync(target).isDirectory() ? collectTests(target) : [target];
  })).concat(collectTests('lib')).sort();
}

function expectSameCall(left, right) {
  expect(left.uses).toBe(right.uses);
  expect(left.with).toEqual(right.with);
}

describe('T10 shared, Android, and iOS canonical topology', () => {
  it('maps every legacy scoped test file exactly once without expansion', () => {
    const legacyShared = sharedFiles();
    expect(new Set(legacyShared).size).toBe(legacyShared.length);
    expect(shared.jobs['shared-tests'].with.domain).toBe('shared');

    const androidBuckets = {
      shared: ['src/shared/platform', 'src/shared/ui', 'src/shared/lib', 'src/shared/commands']
        .flatMap(collectTests),
      source: ['src/companion', 'scripts/android'].flatMap(collectTests)
    };
    const legacyAndroid = [
      'src/companion', 'src/shared/platform', 'src/shared/ui',
      'src/shared/lib', 'src/shared/commands', 'scripts/android'
    ].flatMap(collectTests).sort();
    const selected = Object.values(androidBuckets).flat().sort();
    expect(selected).toEqual(legacyAndroid);
    expect(new Set(selected).size).toBe(selected.length);
    expect(android.jobs['android-source-tests'].with.domain).toBe('android-source');
    expect(android.jobs['android-shared-tests'].with.domain).toBe('android-shared');
    expect(packageJson.scripts['test:release:android-shared']).toContain(
      'src/shared/platform src/shared/ui src/shared/lib src/shared/commands'
    );
    expect(read('.github/workflows/hosted-quality-portable-domain.yml'))
      .toContain('npm run test:release:android-shared');
  });

  it('reuses every shared and Android bucket that overlaps full quality', () => {
    for (const [scopedJob, canonicalJob] of [
      [shared.jobs['shared-tests'], t5.jobs['shared-tests']],
      [shared.jobs['shared-tooling'], t5.jobs['tooling-tests']],
      [shared.jobs['shared-desktop-build'], full.jobs['desktop-build']],
      [shared.jobs['shared-android-web-build'], full.jobs['android-web-build']],
      [android.jobs['android-source-tests'], t5.jobs['android-source-tests']],
      [android.jobs['android-tooling'], t5.jobs['tooling-tests']],
      [android.jobs['android-web-build'], full.jobs['android-web-build']],
      [android.jobs['android-host'], full.jobs['android-host']]
    ]) expectSameCall(scopedJob, canonicalJob);
  });

  it('keeps scoped static exact and preserves the full-only static remainder', () => {
    const scopedStatic = read('.github/workflows/hosted-quality-scoped-static.yml');
    const fullStatic = read('.github/workflows/hosted-quality-static.yml');
    expect(scopedStatic).toContain('quality-gate-target.sh shared-static');
    expect(scopedStatic).toContain('quality-gate-target.sh android-static');
    expect(scopedStatic).not.toContain('lint:full');
    expect(fullStatic).toContain('quality-gate-target.sh release-static');
    expect(fullStatic).not.toContain('shared-static');
    expect(fullStatic).not.toContain('android-static');
  });

  it('collects every scoped result and rejects hosted aggregate fallbacks', () => {
    expect(shared.jobs['shared-admission'].if).toBe('${{ always() }}');
    expect(android.jobs['android-admission'].if).toBe('${{ always() }}');
    const hostedSources = fs.readdirSync('.github/workflows')
      .filter((file) => file.endsWith('.yml'))
      .map((file) => read(`.github/workflows/${file}`)).join('\n');
    for (const aggregate of ['npm run quality:desktop', 'npm run quality:shared', 'npm run quality:android']) {
      expect(hostedSources).not.toContain(aggregate);
    }
    expect(fs.existsSync('.github/workflows/hosted-quality-common.yml')).toBe(false);
    expect(core.jobs['shared-quality'].uses).toBe('./.github/workflows/hosted-quality-shared.yml');
    expect(core.jobs['android-quality'].uses).toBe('./.github/workflows/hosted-quality-android.yml');
  });

  it('keeps iOS scope and full on the same canonical workflow', () => {
    const scopedCall = core.jobs['ios-quality'];
    const fullCall = full.jobs['ios-full'];
    expect(scopedCall.uses).toBe('./.github/workflows/hosted-quality-ios.yml');
    expect(fullCall.uses).toBe(scopedCall.uses);
    expect({ ...scopedCall.with, scope: undefined })
      .toEqual({ ...fullCall.with, scope: undefined });
    expect(scopedCall.with.scope).toBe('${{ inputs.scope }}');
    expect(fullCall.with.scope).toBe('full');
    expect(ios.jobs.simulator.if).toBe("inputs.scope == 'full'");
  });
});
