// @vitest-environment node
/* global process */

import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { changedFilesNeedScriptTests, isScriptTestRootPath } from './script-test-bucket-selection.mjs';

describe('script test bucket root matching', () => {
  it('matches changed files against the script test bucket roots', () => {
    expect(changedFilesNeedScriptTests([])).toBe(true);
    expect(changedFilesNeedScriptTests(['scripts/run-script-test-bucket.mjs'])).toBe(true);
    expect(changedFilesNeedScriptTests(['scripts/demo/export-demo-pack.mjs'])).toBe(true);
    expect(changedFilesNeedScriptTests(['scripts/quality/quality-gate-target.sh'])).toBe(true);
    expect(changedFilesNeedScriptTests(['scripts/script-test-bucket-selection.mjs'])).toBe(true);
    expect(changedFilesNeedScriptTests(['scripts/windows/windows-preview.sh'])).toBe(false);
    expect(changedFilesNeedScriptTests(['src/app/App.tsx'])).toBe(false);
    expect(isScriptTestRootPath('scripts/check-ui-copy-guard.mjs')).toBe(true);
    expect(isScriptTestRootPath('scripts/lib/path-domains.mjs')).toBe(false);
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
