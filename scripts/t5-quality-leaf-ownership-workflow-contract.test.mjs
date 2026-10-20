// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  assertDesktopElectronBucketCoverage,
  buildDesktopElectronBuckets,
  buildDesktopElectronShardBuckets,
  collectElectronTestFiles,
  DESKTOP_ELECTRON_SHARDS
} from './run-desktop-electron-test-bucket.mjs';
import {
  assertReleaseDesktopSourceBucketCoverage,
  buildReleaseDesktopSourceBuckets,
  buildReleaseDesktopSourceShardBuckets,
  collectReleaseDesktopSourceTestFiles,
  RELEASE_DESKTOP_SOURCE_SHARDS
} from './run-release-desktop-source-test-bucket.mjs';
import { SHARED_TEST_BUCKETS } from './run-shared-test-bucket.mjs';
import {
  collectScriptTestFiles,
  isLinuxOnlyScriptTest,
  selectScriptTestBucketFiles
} from './script-test-bucket-selection.mjs';
import { isWindowsHostScriptTest, listWindowsHostScriptTests } from './script-test-windows-host-files.mjs';
import { portableDomainHosts } from './quality/portable-domain-hosts.test-support.mjs';

const read = (file) => fs.readFileSync(file, 'utf8');
const parseWorkflow = (name) => parse(read(`.github/workflows/${name}`));
const portable = parseWorkflow('hosted-quality-portable-domain.yml');
const desktopSource = parseWorkflow('hosted-quality-desktop-source.yml');
const electron = parseWorkflow('hosted-quality-electron.yml');
const t5 = parseWorkflow('t6-hosted-quality.yml');
const tooling = parseWorkflow('hosted-quality-tooling.yml');
const portableHosts = (domain) => portableDomainHosts(portable, domain);
const t5LeafWorkflows = [
  portable, desktopSource, electron, tooling,
  parseWorkflow('hosted-quality-static.yml'),
  parseWorkflow('hosted-quality-desktop-static.yml'),
  parseWorkflow('hosted-quality-windows-core.yml')
];
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

function expectUniqueCoverage(files, buckets) {
  const selected = buckets.flatMap((bucket) => bucket.targets).sort();
  expect(selected).toEqual(files);
  expect(new Set(selected).size).toBe(selected.length);
}

function sharedFiles() {
  return SHARED_TEST_BUCKETS.flatMap(({ targets }) => targets.flatMap((target) => {
    if (target.startsWith('--exclude=')) return [];
    return fs.statSync(target).isDirectory() ? collectTests(target) : [target];
  })).sort();
}

function localWorkflowCalls(file) {
  const source = read(`.github/workflows/${file}`);
  return [...source.matchAll(/uses: \.\/\.github\/workflows\/([^\s]+\.yml)/gu)]
    .map((match) => match[1]);
}

function maximumWorkflowDepth(file, ancestors = []) {
  if (ancestors.includes(file)) throw new Error(`workflow call cycle: ${[...ancestors, file].join(' -> ')}`);
  const calls = localWorkflowCalls(file);
  return calls.length === 0 ? 1 : 1 + Math.max(...calls.map(
    (called) => maximumWorkflowDepth(called, [...ancestors, file])
  ));
}

describe('T5 canonical leaf ownership', () => {
  it('provides a running native DNS-SD daemon before Linux Electron tests', () => {
    const steps = electron.jobs['electron-tests'].steps;
    const setup = steps.find((step) => step.name === 'Prepare Linux native DNS-SD');
    expect(setup.if).toBe("runner.os == 'Linux'");
    expect(setup.run).toContain('libavahi-client-dev avahi-daemon dbus');
    expect(setup.run).toContain('sudo systemctl start dbus avahi-daemon');
    expect(setup.run).toContain('avahi-daemon --check');
    expect(steps.indexOf(setup)).toBeLessThan(steps.findIndex(
      (step) => step.name === 'Run canonical Electron bucket'
    ));
  });

  // The dev chain staggers short stages to stay within 20 jobs; see dev-quality-chain contract.
  it('requests twenty-two runner-backed leaves in the gated release baseline wave', () => {
    const fixedLeaves = 4;
    const portableLeaves = portableHosts('shared').length + portableHosts('android-source').length;
    const bucketLeaves = [desktopSource, electron, tooling].reduce((total, workflow) => (
      total + Object.values(workflow.jobs)[0].strategy.matrix.include.length
    ), 0);
    expect(fixedLeaves + portableLeaves + bucketLeaves).toBe(22);
  });

  it('keeps every portable domain on its own hosts without cross-domain execution', () => {
    expect(portable.jobs['portable-domain-tests'].strategy['fail-fast']).toBe(false);
    expect(portable.jobs['portable-domain-tests']['timeout-minutes'])
      .toBe("${{ inputs.domain == 'shared' && 40 || 20 }}");
    expect(portable.jobs['portable-domain-tests'].if)
      .toBe("inputs.domain == 'shared' || inputs.domain == 'android-source' || inputs.domain == 'android-shared'");
    const steps = portable.jobs['portable-domain-tests'].steps;
    expect(steps.find(({ name }) => name === 'Run canonical shared domain').if)
      .toBe("inputs.domain == 'shared'");
    expect(steps.find(({ name }) => name === 'Run canonical Android source domain').if)
      .toBe("inputs.domain == 'android-source'");
    expect(t5.jobs['t5-shared'].with.domain).toBe('shared');
    expect(t5.jobs['t5-android-source'].with.domain).toBe('android-source');
  });

  it('maps every original test file to exactly one shard on both canonical hosts', () => {
    const desktopFiles = collectReleaseDesktopSourceTestFiles();
    const desktopBuckets = buildReleaseDesktopSourceBuckets(desktopFiles);
    assertReleaseDesktopSourceBucketCoverage(desktopFiles, desktopBuckets);
    expectUniqueCoverage(desktopFiles, RELEASE_DESKTOP_SOURCE_SHARDS.flatMap(
      (shard) => buildReleaseDesktopSourceShardBuckets(shard, desktopBuckets)
    ));

    const electronFiles = collectElectronTestFiles();
    const electronBuckets = buildDesktopElectronBuckets();
    assertDesktopElectronBucketCoverage(electronFiles, electronBuckets);
    const selectedElectronFiles = DESKTOP_ELECTRON_SHARDS.flatMap(
      (shard) => buildDesktopElectronShardBuckets(shard, electronBuckets)
    ).flatMap((bucket) => bucket.targets).sort();
    expect(new Set(selectedElectronFiles).size).toBe(selectedElectronFiles.length);
    expect(selectedElectronFiles).toEqual(expect.arrayContaining(electronFiles));

    const originalHostDomainCollections = {
      'android-source': [...collectTests('src/companion'), ...collectTests('scripts/android')].sort(),
      shared: sharedFiles()
    };
    for (const files of Object.values(originalHostDomainCollections)) {
      expect(new Set(files).size).toBe(files.length);
      expect(files.length).toBeGreaterThan(0);
    }
    const leafHostDomainCollections = Object.fromEntries(
      Object.entries(originalHostDomainCollections).flatMap(([domain, files]) => (
        portableHosts(domain).map(({ host }) => [`${host}:${domain}`, files])
      ))
    );
    for (const [hostDomain, files] of Object.entries(leafHostDomainCollections)) {
      const domain = hostDomain.split(':')[1];
      expect(files).toEqual(originalHostDomainCollections[domain]);
    }
  });

  it('keeps tooling files complete and unique on each required host projection', () => {
    const files = collectScriptTestFiles();
    const ubuntu = selectScriptTestBucketFiles('all', files);
    const windows = ['core-one', 'core-two', 'gate-one', 'gate-two',
      'gate-integration', 'node', 'preview'].flatMap(
      (bucket) => selectScriptTestBucketFiles(bucket, files, 'win32')
    ).sort();
    expect(ubuntu).toEqual(files);
    expect(windows).toEqual(files.filter(isWindowsHostScriptTest));
    expect(files).toEqual(expect.arrayContaining(listWindowsHostScriptTests()));
    expect(new Set(windows).size).toBe(windows.length);
    expect(files.filter(isLinuxOnlyScriptTest).length).toBeGreaterThan(0);
  });

  it('has one reusable owner for static and Windows core with no aggregate fallback', () => {
    const workflowSources = fs.readdirSync('.github/workflows')
      .filter((file) => file.endsWith('.yml'))
      .map((file) => read(`.github/workflows/${file}`));
    expect(workflowSources.filter((source) => source.includes(
      'bash scripts/quality/quality-gate-target.sh release-static'
    ))).toHaveLength(1);
    expect(workflowSources.filter((source) => source.includes(
      'npm run quality:release:windows:core'
    ))).toHaveLength(1);
    expect(workflowSources.filter((source) => source.includes(
      'npm run deps:hardening:check'
    ))).toHaveLength(1);
    expect(workflowSources.filter((source) => source.includes(
      'quality-gate-target.sh desktop-static'
    ))).toHaveLength(1);
    expect(fs.existsSync('.github/workflows/hosted-quality-portable.yml')).toBe(false);
  });

  it('activates pinned npm inside every npm leaf setup', () => {
    for (const file of [
      'hosted-quality-static.yml',
      'hosted-quality-scoped-static.yml',
      'hosted-quality-android-host.yml',
      'hosted-quality-android-web-build.yml',
      'hosted-quality-desktop-static.yml',
      'hosted-quality-dependency-hardening.yml',
      'hosted-quality-desktop-build.yml',
      'hosted-quality-windows-core.yml',
      'hosted-quality-portable-domain.yml',
      'hosted-quality-desktop-source.yml',
      'hosted-quality-electron.yml',
      'hosted-quality-tooling.yml'
    ]) {
      const source = read(`.github/workflows/${file}`);
      expect(source.match(/Activate pinned npm/gu)).toHaveLength(1);
      expect(source.indexOf('Activate pinned npm')).toBeLessThan(source.indexOf('Install dependencies'));
    }
  });

  it('keeps diagnostic log uploads from replacing canonical leaf results', () => {
    for (const workflow of t5LeafWorkflows) {
      const testJob = Object.values(workflow.jobs)[0];
      const uploadSteps = testJob.steps.filter(({ name }) => name.startsWith('Upload '));
      expect(uploadSteps.length).toBeGreaterThan(0);
      for (const step of uploadSteps) {
        expect(step.if).toBe('${{ always() }}');
        expect(step['continue-on-error']).toBe(true);
      }
      for (const step of testJob.steps.filter(({ name }) => name.startsWith('Run '))) {
        expect(step['continue-on-error']).toBeUndefined();
      }
    }
  });

  it('balances every Electron host and runs every shard exactly once per host', () => {
    const include = electron.jobs['electron-tests'].strategy.matrix.include;
    for (const host of ['Ubuntu', 'Windows']) {
      const shards = include.filter((entry) => entry.host === host).flatMap(({ shards }) => shards);
      expect([...shards].sort()).toEqual([...DESKTOP_ELECTRON_SHARDS].sort());
    }
    expect(include).toHaveLength(7);
  });

  it('keeps every top-level caller within GitHub reusable workflow depth limits', () => {
    expect(maximumWorkflowDepth('t7-hosted-quality.yml')).toBeLessThanOrEqual(10);
    expect(maximumWorkflowDepth('remote-quality.yml')).toBeLessThanOrEqual(10);
    expect(maximumWorkflowDepth('t7-release.yml')).toBeLessThanOrEqual(10);
  });
});
