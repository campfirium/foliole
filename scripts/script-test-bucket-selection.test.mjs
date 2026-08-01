// @vitest-environment node
/* global process */

import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  GATE_INTEGRATION_SCRIPT_NAMES,
  changedFilesNeedScriptTests,
  collectScriptTestFiles,
  isScriptTestRootPath,
  selectGateIntegrationScriptNames,
  selectScriptTestBucketFiles
} from './script-test-bucket-selection.mjs';

function expectExactPartition(expected, parts) {
  const flattened = parts.flat();
  expect([...flattened].sort()).toEqual([...expected].sort());
  expect(new Set(flattened).size).toBe(flattened.length);
}

describe('script test bucket root matching', () => {
  it('matches changed files against the script test bucket roots', () => {
    expect(changedFilesNeedScriptTests([])).toBe(true);
    expect(changedFilesNeedScriptTests(['scripts/run-script-test-bucket.mjs'])).toBe(true);
    expect(changedFilesNeedScriptTests(['scripts/demo/export-demo-pack.mjs'])).toBe(true);
    expect(changedFilesNeedScriptTests(['scripts/quality/quality-gate-target.sh'])).toBe(true);
    expect(changedFilesNeedScriptTests(['scripts/script-test-bucket-selection.mjs'])).toBe(true);
    expect(changedFilesNeedScriptTests(['scripts/windows/windows-preview-native.mjs'])).toBe(false);
    expect(changedFilesNeedScriptTests(['src/app/App.tsx'])).toBe(false);
    expect(isScriptTestRootPath('scripts/check-ui-copy-guard.mjs')).toBe(true);
    expect(isScriptTestRootPath('scripts/lib/path-domains.mjs')).toBe(true);
  });

  it('collects scripts/lib contract tests in the formal core bucket', () => {
    const coreFiles = selectScriptTestBucketFiles('core', collectScriptTestFiles());

    expect(coreFiles).toContain('scripts/lib/path-domains.test.mjs');
    expect(coreFiles).toContain('scripts/lib/script-domain-registry.test.mjs');
  });

  it('partitions hosted Windows tooling without missing or duplicating tests', () => {
    const files = collectScriptTestFiles();
    const core = selectScriptTestBucketFiles('core', files);
    const gate = selectScriptTestBucketFiles('gate', files);

    expectExactPartition(core, [
      selectScriptTestBucketFiles('core-one', files),
      selectScriptTestBucketFiles('core-two', files)
    ]);
    expectExactPartition(gate, [
      selectScriptTestBucketFiles('gate-one', files),
      selectScriptTestBucketFiles('gate-two', files)
    ]);
    expectExactPartition(GATE_INTEGRATION_SCRIPT_NAMES, [
      selectGateIntegrationScriptNames('integration-one'),
      selectGateIntegrationScriptNames('integration-two')
    ]);
  });

  it('exposes changed-file matching through the CLI command', () => {
    const scriptChange = spawnSync(process.execPath, ['scripts/script-test-bucket-selection.mjs', 'changed-files-need-script-tests'], {
      input: 'scripts/quality/quality-gate-target.sh\n',
      encoding: 'utf8'
    });
    const productChange = spawnSync(process.execPath, ['scripts/script-test-bucket-selection.mjs', 'changed-files-need-script-tests'], {
      input: 'src/app/example.ts\n',
      encoding: 'utf8'
    });

    expect(scriptChange.status).toBe(0);
    expect(productChange.status).toBe(1);
  });
});
