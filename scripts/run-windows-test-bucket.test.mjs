// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  isWindowsPreviewRecoveryTest,
  selectWindowsTestBucketFiles
} from './run-windows-test-bucket.mjs';

describe('run-windows-test-bucket', () => {
  it('classifies preview and recovery tests outside the Windows core bucket', () => {
    expect(isWindowsPreviewRecoveryTest('scripts/windows/windows-preview.test.mjs')).toBe(true);
    expect(isWindowsPreviewRecoveryTest('scripts/windows/windows-preview-native-runtime.test.mjs')).toBe(true);
    expect(isWindowsPreviewRecoveryTest('scripts/windows/restart-electron-dev.test.mjs')).toBe(true);
    expect(isWindowsPreviewRecoveryTest('scripts/windows/windows-client-native-restart.test.mjs')).toBe(true);
    expect(isWindowsPreviewRecoveryTest('scripts/windows/windows-client-native.test.mjs')).toBe(false);
    expect(isWindowsPreviewRecoveryTest('scripts/windows/package-windows.test.mjs')).toBe(false);
  });

  it('selects core and preview-recovery buckets from the same file list', () => {
    const files = [
      'scripts/windows/package-windows.test.mjs',
      'scripts/windows/restart-electron-dev.test.mjs',
      'scripts/windows/windows-client-native.test.mjs',
      'scripts/windows/windows-preview.test.mjs',
      'scripts/windows/windows-preview-native-runtime.test.mjs'
    ];

    expect(selectWindowsTestBucketFiles('core', files)).toEqual([
      'scripts/windows/package-windows.test.mjs',
      'scripts/windows/windows-client-native.test.mjs'
    ]);
    expect(selectWindowsTestBucketFiles('preview-recovery', files)).toEqual([
      'scripts/windows/restart-electron-dev.test.mjs',
      'scripts/windows/windows-preview.test.mjs',
      'scripts/windows/windows-preview-native-runtime.test.mjs'
    ]);
    expect(selectWindowsTestBucketFiles('all', files)).toEqual(files);
    expect(selectWindowsTestBucketFiles('unknown', files)).toBeNull();
  });
});
