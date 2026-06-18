// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  isPreviewDedupeTest,
  isQualityGateTest,
  isNodeOnlyScriptTest,
  selectScriptTestBucketFiles
} from './run-script-test-bucket.mjs';

describe('run-script-test-bucket', () => {
  it('classifies quality gate and preview tests outside the script core bucket', () => {
    expect(isQualityGateTest('scripts/quality/quality-gate-target.test.mjs')).toBe(true);
    expect(isQualityGateTest('scripts/quality/quality-skip-lint.test.mjs')).toBe(true);
    expect(isQualityGateTest('scripts/check-ui-copy-guard.test.mjs')).toBe(false);
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
      'scripts/quality/quality-gate-target.test.mjs',
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
      'scripts/quality/quality-gate-target.test.mjs',
      'scripts/quality/quality-skip-lint.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('node', files)).toEqual(['scripts/test-files.test.mjs']);
    expect(selectScriptTestBucketFiles('preview', files)).toEqual([
      'scripts/preview/preview-dedupe.test.mjs',
      'scripts/preview/preview-dedupe-batch.test.mjs'
    ]);
    expect(selectScriptTestBucketFiles('all', files)).toEqual(files);
    expect(selectScriptTestBucketFiles('unknown', files)).toBeNull();
  });
});
