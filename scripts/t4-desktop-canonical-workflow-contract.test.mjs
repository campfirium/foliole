// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { buildDesktopElectronBuckets } from './run-desktop-electron-test-bucket.mjs';
import { collectReleaseDesktopSourceTestFiles } from './run-release-desktop-source-test-bucket.mjs';
import { SHARED_TEST_BUCKETS } from './run-shared-test-bucket.mjs';

const read = (file) => fs.readFileSync(file, 'utf8');
const workflow = (name) => parse(read(`.github/workflows/${name}`));
const core = workflow('hosted-quality-core.yml');
const full = workflow('hosted-quality-full.yml');
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

function sharedLeafFiles() {
  return SHARED_TEST_BUCKETS.flatMap(({ targets }) => targets.flatMap((target) => {
    if (target.startsWith('--exclude=')) return [];
    return fs.statSync(target).isDirectory() ? collectTests(target) : [target];
  })).concat(collectTests('lib')).sort();
}

function expectSameCall(left, right) {
  expect(left.uses).toBe(right.uses);
  expect(left.with).toEqual(right.with);
}

describe('T4 desktop canonical bucket topology', () => {
  it('maps every legacy desktop test file to exactly one canonical product leaf', () => {
    const legacy = [
      ...collectTests('src/app'), ...collectTests('src/features'),
      ...collectTests('src/shared/platform'), ...collectTests('src/shared/ui'),
      ...collectTests('src/test'), ...collectTests('electron'),
      'src/startupBootstrap.test.ts', 'src/startupViewMode.test.ts'
    ].sort();
    const buckets = {
      'desktop-source': collectReleaseDesktopSourceTestFiles(),
      electron: buildDesktopElectronBuckets().flatMap(({ targets }) => targets),
      shared: sharedLeafFiles()
    };
    const selected = legacy.map((file) => ({
      file,
      owners: Object.entries(buckets).filter(([, files]) => files.includes(file)).map(([name]) => name)
    }));
    expect(selected.filter(({ owners }) => owners.length !== 1)).toEqual([]);
    expect(selected.map(({ file }) => file)).toEqual(legacy);
  });

  it('uses the same reusable calls for every desktop bucket shared with full quality', () => {
    const pairs = [
      ['desktop-static', t5.jobs['desktop-static']],
      ['desktop-source-tests', t5.jobs['desktop-source-tests']],
      ['desktop-shared-tests', t5.jobs['shared-tests']],
      ['desktop-electron-tests', t5.jobs['electron-tests']],
      ['desktop-tooling-tests', t5.jobs['tooling-tests']],
      ['desktop-windows-core', t5.jobs['windows-core']],
      ['desktop-dependency-hardening', t5.jobs['dependency-hardening']],
      ['desktop-build', full.jobs['desktop-build']]
    ];
    for (const [coreName, fullJob] of pairs) expectSameCall(core.jobs[coreName], fullJob);
    expect(new Set(pairs.map(([, job]) => job.uses)).size).toBe(pairs.length);
  });

  it('preserves desktop static, hardening, build, compile, and boundary commands', () => {
    const staticSource = read('.github/workflows/hosted-quality-desktop-static.yml');
    const hardeningSource = read('.github/workflows/hosted-quality-dependency-hardening.yml');
    const buildSource = read('.github/workflows/hosted-quality-desktop-build.yml');
    expect(staticSource).toContain('quality-gate-target.sh desktop-static');
    expect(staticSource).not.toContain('lint:full');
    expect(hardeningSource).toContain('npm run deps:hardening:check');
    for (const command of [
      'npm run build', 'npm run electron:compile',
      'node scripts/check-workspace-settings-boundary.mjs'
    ]) expect(buildSource).toContain(command);
  });

  it('collects every desktop result and labels T5 as not applicable', () => {
    const admission = core.jobs['desktop-admission'];
    expect(admission.if).toBe("${{ always() && inputs.scope == 'desktop' }}");
    expect(admission.needs).toEqual([
      'desktop-static', 'desktop-source-tests', 'desktop-shared-tests',
      'desktop-electron-tests', 'desktop-tooling-tests', 'desktop-windows-core',
      'desktop-dependency-hardening', 'desktop-build', 'linux-package-acceptance'
    ]);
    expect(admission.steps[0].run).toContain('T5 baseline: not applicable to scoped run');
  });

  it('removes the hosted monolith and keeps bucket selection independent of changed files', () => {
    const desktopSources = [
      'hosted-quality-core.yml', 'hosted-quality-desktop-static.yml',
      'hosted-quality-desktop-source.yml', 'hosted-quality-portable-domain.yml',
      'hosted-quality-electron.yml', 'hosted-quality-tooling.yml',
      'hosted-quality-windows-core.yml', 'hosted-quality-dependency-hardening.yml',
      'hosted-quality-desktop-build.yml'
    ].map((name) => read(`.github/workflows/${name}`)).join('\n');
    expect(desktopSources).not.toContain('npm run quality:desktop');
    expect(desktopSources).not.toContain('VITEST_DESKTOP_POOL');
    expect(desktopSources).not.toContain('changed-files');
    expect(desktopSources).not.toContain('paths-ignore:');
    expect(read('scripts/quality/quality-gate-target.sh')).not.toContain('VITEST_DESKTOP_POOL');
  });
});
