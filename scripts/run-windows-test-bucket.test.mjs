// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  isWindowsNativePreviewTest,
  selectWindowsTestBucketFiles
} from './run-windows-test-bucket.mjs';

describe('run-windows-test-bucket', () => {
  it('classifies native preview tests outside the Windows core bucket', () => {
    expect(isWindowsNativePreviewTest('scripts/windows/windows-preview-native-runtime.test.mjs')).toBe(true);
    expect(isWindowsNativePreviewTest('scripts/windows/windows-client-native-restart.test.mjs')).toBe(true);
    expect(isWindowsNativePreviewTest('scripts/windows/windows-preview.test.mjs')).toBe(false);
    expect(isWindowsNativePreviewTest('scripts/windows/windows-client-native.test.mjs')).toBe(false);
    expect(isWindowsNativePreviewTest('scripts/windows/package-windows.test.mjs')).toBe(false);
  });

  it('selects core and native-preview buckets from the same file list', () => {
    const files = [
      'scripts/windows/package-windows.test.mjs',
      'scripts/windows/windows-client-native.test.mjs',
      'scripts/windows/windows-preview-native-runtime.test.mjs'
    ];

    expect(selectWindowsTestBucketFiles('core', files)).toEqual([
      'scripts/windows/package-windows.test.mjs',
      'scripts/windows/windows-client-native.test.mjs'
    ]);
    expect(selectWindowsTestBucketFiles('native-preview', files)).toEqual([
      'scripts/windows/windows-preview-native-runtime.test.mjs'
    ]);
    expect(selectWindowsTestBucketFiles('all', files)).toEqual(files);
    expect(selectWindowsTestBucketFiles('unknown', files)).toBeNull();
  });
});
