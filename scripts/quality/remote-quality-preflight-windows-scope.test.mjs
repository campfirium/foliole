// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

import { buildDesktopElectronBuckets } from '../run-desktop-electron-test-bucket.mjs';
import { collectReleaseDesktopSourceTestFiles } from '../run-release-desktop-source-test-bucket.mjs';
import { selectWindowsTestBucketFiles } from '../run-windows-test-bucket.mjs';
import { collectScriptTestFiles, selectScriptTestBucketFiles } from '../script-test-bucket-selection.mjs';
import { SHARED_TEST_BUCKETS } from '../shared-test-bucket-config.mjs';
import { isPreflightTestFile } from './remote-quality-preflight-select.mjs';
import { isWindowsRemoteTestFile } from './remote-quality-preflight-windows-scope.mjs';

const TEST_PATTERN = /\.test\.(?:mjs|mts|ts|tsx)$/u;
const WINDOWS_TOOLING_BUCKETS = ['core-one', 'core-two', 'gate-one', 'gate-two', 'gate-integration', 'node', 'preview'];

function collect(target) {
  if (!fs.statSync(target).isDirectory()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.posix.join(target, entry.name);
    if (entry.isDirectory()) return collect(entryPath);
    return TEST_PATTERN.test(entry.name) ? [entryPath] : [];
  });
}

// What the hosted Windows leaves of a dev full run execute, from their own bucket builders.
function hostedWindowsTests() {
  const scripts = collectScriptTestFiles();
  return new Set([
    ...SHARED_TEST_BUCKETS.flatMap(({ targets }) => targets.flatMap(collect)),
    ...collectReleaseDesktopSourceTestFiles(),
    ...buildDesktopElectronBuckets().flatMap(({ targets }) => targets),
    ...selectWindowsTestBucketFiles('core', collect('scripts/windows').filter((file) => file.endsWith('.test.mjs'))),
    ...WINDOWS_TOOLING_BUCKETS.flatMap((bucket) => selectScriptTestBucketFiles(bucket, scripts, 'win32'))
  ]);
}

it('matches exactly the tracked tests that hosted Windows leaves run', () => {
  const hosted = hostedWindowsTests();
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(isPreflightTestFile);
  const mismatched = tracked.filter((file) => isWindowsRemoteTestFile(file) !== hosted.has(file));
  expect(mismatched).toEqual([]);
  expect(tracked.filter(isWindowsRemoteTestFile).length).toBeGreaterThan(1000);
});

it('leaves macOS-only, Linux-only, and Ubuntu-only tooling tests out of the Windows preflight', () => {
  expect(isWindowsRemoteTestFile('scripts/macos/run-internal-update.test.mjs')).toBe(false);
  expect(isWindowsRemoteTestFile('scripts/quality/quality-gate-fast.delegation.test.mjs')).toBe(false);
  expect(isWindowsRemoteTestFile('src/companion/companionEditorHttp.integration.test.tsx')).toBe(false);
  expect(isWindowsRemoteTestFile(
    'src/shared/platform/companion/sync/framed/companionMobileSessionAdoption.integration.test.ts'
  )).toBe(true);
  expect(isWindowsRemoteTestFile('electron/sync/desktopRequestSyncScale.integration.test.ts')).toBe(true);
});
