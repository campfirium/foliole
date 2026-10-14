// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const appBuild = fs.readFileSync('android/app/build.gradle', 'utf8');
const variables = fs.readFileSync('android/variables.gradle', 'utf8');

describe('Android core library desugaring contract', () => {
  it('keeps Java library desugaring enabled for packaged dependencies', () => {
    expect(appBuild).toContain('coreLibraryDesugaringEnabled true');
    expect(appBuild).toContain("coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.5'");
  });
  it('uses Android 9 as the oldest supported system for the Hisense A5 baseline', () => {
    expect(variables.match(/minSdkVersion\s*=\s*(\d+)/u)?.[1]).toBe('28');
    expect(appBuild).toContain('minSdkVersion rootProject.ext.minSdkVersion');
  });
});
