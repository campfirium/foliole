// @vitest-environment node
/* global process */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isPreviewDedupeTest,
  isQualityGateTest,
  isQualityGateIntegrationTest,
  isNodeOnlyScriptTest,
  selectScriptTestBucketFiles
} from './script-test-bucket-selection.mjs';
import {
  resolveBucketTimeoutSeconds,
  writeBucketTimeoutReport
} from './run-script-test-bucket.mjs';

describe('run-script-test-bucket', () => {
  it('classifies quality gate and preview tests outside the script core bucket', () => {
    expect(isQualityGateTest('scripts/quality/quality-gate-target.test.mjs')).toBe(true);
    expect(isQualityGateTest('scripts/quality/quality-skip-lint.test.mjs')).toBe(true);
    expect(isQualityGateTest('scripts/check-ui-copy-guard.test.mjs')).toBe(false);
    expect(isQualityGateIntegrationTest('scripts/quality/quality-gate-fast.delegation.test.mjs')).toBe(true);
    expect(isQualityGateIntegrationTest('scripts/quality/quality-gate-target.test.mjs')).toBe(true);
    expect(isPreviewDedupeTest('scripts/preview/preview-dedupe.test.mjs')).toBe(true);
    expect(isPreviewDedupeTest('scripts/preview/preview-dedupe-batch.test.mjs')).toBe(true);
    expect(isPreviewDedupeTest('scripts/preview.test.mjs')).toBe(false);
    expect(isNodeOnlyScriptTest('scripts/test-files.test.mjs')).toBe(true);
    expect(isNodeOnlyScriptTest('scripts/run-vitest-with-summary.test.mjs')).toBe(false);
  });

  it('selects all script quality buckets from the same file list', () => {
    const files = [
      'scripts/check-ui-copy-guard.test.mjs',
      'scripts/codex/codex-task.test.mjs',
      'scripts/preview/preview-dedupe.test.mjs',
      'scripts/preview/preview-dedupe-batch.test.mjs',
      'scripts/quality/quality-gate-critical-routes.integration.test.mjs',
      'scripts/quality/quality-gate-fast.delegation.test.mjs',
      'scripts/quality/quality-gate-fast-lib-routing.test.mjs',
      'scripts/quality/quality-gate-release-tail-targets.test.mjs',
      'scripts/quality/quality-gate-release-targets.test.mjs',
      'scripts/quality/quality-gate-skip-lint-integration.test.mjs',
      'scripts/quality/quality-gate-target-collect.test.mjs',
      'scripts/quality/quality-gate-target-failures.test.mjs',
      'scripts/quality/quality-gate-target.test.mjs',
      'scripts/quality/quality-gate-telemetry.test.mjs',
      'scripts/quality/quality-skip-lint.test.mjs',
      'scripts/test-files.test.mjs',
      'scripts/sync/sql-surface-scan.test.mjs'
    ];

    expect(selectScriptTestBucketFiles('core', files)).toEqual([
      'scripts/check-ui-copy-guard.test.mjs',
      'scripts/codex/codex-task.test.mjs',
      'scripts/sync/sql-surface-scan.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('gate', files)).toEqual([
      'scripts/quality/quality-skip-lint.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('gate-integration', files)).toEqual([
      'scripts/quality/quality-gate-critical-routes.integration.test.mjs',
      'scripts/quality/quality-gate-fast.delegation.test.mjs',
      'scripts/quality/quality-gate-fast-lib-routing.test.mjs',
      'scripts/quality/quality-gate-release-tail-targets.test.mjs',
      'scripts/quality/quality-gate-release-targets.test.mjs',
      'scripts/quality/quality-gate-skip-lint-integration.test.mjs',
      'scripts/quality/quality-gate-target-collect.test.mjs',
      'scripts/quality/quality-gate-target-failures.test.mjs',
      'scripts/quality/quality-gate-target.test.mjs',
      'scripts/quality/quality-gate-telemetry.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('gate-integration-routing', files)).toEqual([
      'scripts/quality/quality-gate-critical-routes.integration.test.mjs',
      'scripts/quality/quality-gate-fast-lib-routing.test.mjs',
      'scripts/quality/quality-gate-skip-lint-integration.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('gate-integration-fast-delegation', files)).toEqual([
      'scripts/quality/quality-gate-fast.delegation.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('gate-integration-release-targets', files)).toEqual([
      'scripts/quality/quality-gate-release-targets.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('gate-integration-release-tail', files)).toEqual([
      'scripts/quality/quality-gate-release-tail-targets.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('gate-integration-targets', files)).toEqual([
      'scripts/quality/quality-gate-target-collect.test.mjs',
      'scripts/quality/quality-gate-target-failures.test.mjs',
      'scripts/quality/quality-gate-target.test.mjs',
      'scripts/quality/quality-gate-telemetry.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('gate-integration-target-core', files)).toEqual([
      'scripts/quality/quality-gate-target.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('gate-integration-target-failures', files)).toEqual([
      'scripts/quality/quality-gate-target-failures.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('gate-integration-target-collect', files)).toEqual([
      'scripts/quality/quality-gate-target-collect.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('gate-integration-target-telemetry', files)).toEqual([
      'scripts/quality/quality-gate-telemetry.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('node', files)).toEqual(['scripts/test-files.test.mjs']);
    expect(selectScriptTestBucketFiles('preview', files)).toEqual([
      'scripts/preview/preview-dedupe.test.mjs',
      'scripts/preview/preview-dedupe-batch.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('all', files)).toEqual(files);
    expect(selectScriptTestBucketFiles('unknown', files)).toBeNull();
  });

  it('resolves bucket timeout from specific and shared environment overrides', () => {
    const oldSpecific = process.env.SCRIPT_TEST_BUCKET_GATE_TIMEOUT_SECONDS;
    const oldShared = process.env.SCRIPT_TEST_BUCKET_TIMEOUT_SECONDS;
    try {
      process.env.SCRIPT_TEST_BUCKET_TIMEOUT_SECONDS = '42';
      expect(resolveBucketTimeoutSeconds('core')).toBe(42);
      process.env.SCRIPT_TEST_BUCKET_GATE_TIMEOUT_SECONDS = '7';
      expect(resolveBucketTimeoutSeconds('gate')).toBe(7);
      process.env.SCRIPT_TEST_BUCKET_GATE_TIMEOUT_SECONDS = 'invalid';
      expect(resolveBucketTimeoutSeconds('gate')).toBe(240);
      delete process.env.SCRIPT_TEST_BUCKET_TIMEOUT_SECONDS;
      expect(resolveBucketTimeoutSeconds('gate-integration')).toBe(600);
    } finally {
      if (oldSpecific === undefined) {
        delete process.env.SCRIPT_TEST_BUCKET_GATE_TIMEOUT_SECONDS;
      } else {
        process.env.SCRIPT_TEST_BUCKET_GATE_TIMEOUT_SECONDS = oldSpecific;
      }
      if (oldShared === undefined) {
        delete process.env.SCRIPT_TEST_BUCKET_TIMEOUT_SECONDS;
      } else {
        process.env.SCRIPT_TEST_BUCKET_TIMEOUT_SECONDS = oldShared;
      }
    }
  });

  it('writes a readable timeout report before killing a bucket run', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'script-test-bucket-'));
    const reportPath = path.join(tempRoot, 'quality-gate-integration.json');
    try {
      writeBucketTimeoutReport(reportPath, 'gate-integration', 600, [
        'scripts/quality/quality-gate-release-targets.test.mjs',
        'scripts/quality/quality-gate-target.test.mjs'
      ]);

      const report = JSON.parse(await readFile(reportPath, 'utf8'));

      expect(report.success).toBe(false);
      expect(report.wasInterrupted).toBe(true);
      expect(report.numTotalTestSuites).toBe(2);
      expect(report.testResults[0].name).toBe('scripts/run-script-test-bucket.mjs:gate-integration');
      expect(report.testResults[0].assertionResults[0].failureMessages[0]).toContain('gate-integration exceeded timeout (600s)');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
