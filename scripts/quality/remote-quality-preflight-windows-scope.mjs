import path from 'node:path';

import { RELEASE_DESKTOP_SOURCE_ROOT_TESTS } from '../run-release-desktop-source-test-bucket.mjs';
import { isWindowsNativePreviewTest } from '../run-windows-test-bucket.mjs';
import { isScriptTestRootPath } from '../script-test-bucket-selection.mjs';
import { isWindowsHostScriptTest } from '../script-test-windows-host-files.mjs';
import { SHARED_TEST_BUCKETS } from '../shared-test-bucket-config.mjs';

const SHARED_TARGETS = SHARED_TEST_BUCKETS.flatMap(({ targets }) => targets);

const underTarget = (file, target) => file === target || file.startsWith(`${target}/`);

// Mirrors the test sets of the hosted Windows leaves: shared, desktop source,
// Electron, Windows core, and the Windows tooling projection.
const WINDOWS_REMOTE_OWNERS = [
  (file) => SHARED_TARGETS.some((target) => underTarget(file, target)),
  (file) => ['src/app/', 'src/test/'].some((root) => file.startsWith(root))
    || RELEASE_DESKTOP_SOURCE_ROOT_TESTS.includes(file),
  (file) => file.startsWith('electron/')
    || (file.startsWith('scripts/') && path.posix.basename(file).includes('electron')),
  (file) => file.startsWith('scripts/windows/') && file.endsWith('.test.mjs')
    && !isWindowsNativePreviewTest(file),
  (file) => isScriptTestRootPath(file) && isWindowsHostScriptTest(file)
];

export function isWindowsRemoteTestFile(file) {
  return WINDOWS_REMOTE_OWNERS.some((owns) => owns(file));
}
