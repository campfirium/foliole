import { describe, expect, it } from 'vitest';

import {
  extractFocusedWindow,
  extractTopActivity,
  matchesLaunchComponent,
  normalizeComponent
} from './verify-android-launch.mjs';

describe('verify-android-launch helpers', () => {
  it('extracts top resumed activity from modern dumpsys output', () => {
    const output = [
      'topResumedActivity=ActivityRecord{123 u0 com.foliole.android/.MainActivity t12}',
      'ResumedActivity: ActivityRecord{456 u0 com.android.launcher3/.Launcher t4}'
    ].join('\n');

    expect(extractTopActivity(output)).toBe('com.foliole.android/.MainActivity');
  });

  it('extracts resumed activity from legacy dumpsys output', () => {
    const output = 'ResumedActivity: ActivityRecord{123 u0 com.foliole.android/com.foliole.android.MainActivity t12}';

    expect(extractTopActivity(output)).toBe('com.foliole.android/com.foliole.android.MainActivity');
  });

  it('extracts focused window from window dumpsys output', () => {
    const output = [
      'mCurrentFocus=Window{123 u0 com.foliole.android/.MainActivity}',
      'mFocusedApp=AppWindowToken{456 token=Token{789 ActivityRecord{abc u0 com.foliole.android/.MainActivity t12}}}'
    ].join('\n');

    expect(extractFocusedWindow(output)).toBe('com.foliole.android/.MainActivity');
  });

  it('extracts the MIUI input target when legacy focus fields are absent', () => {
    const output = 'imeInputTarget in display# 0 Window{46e3b32 u0 com.foliole.android/com.foliole.android.MainActivity}';

    expect(extractFocusedWindow(output)).toBe('com.foliole.android/com.foliole.android.MainActivity');
  });

  it('normalizes short activity names before matching', () => {
    expect(normalizeComponent('com.foliole.android/.MainActivity')).toBe(
      'com.foliole.android/com.foliole.android.MainActivity'
    );
  });

  it('matches launch component against normalized activity names', () => {
    expect(
      matchesLaunchComponent(
        'com.foliole.android/.MainActivity',
        'com.foliole.android/com.foliole.android.MainActivity',
        'com.foliole.android'
      )
    ).toBe(true);
  });

  it('rejects launcher foreground when the app falls back out of front', () => {
    expect(
      matchesLaunchComponent(
        'com.android.launcher3/.Launcher',
        'com.foliole.android/com.foliole.android.MainActivity',
        'com.foliole.android'
      )
    ).toBe(false);
  });
});
