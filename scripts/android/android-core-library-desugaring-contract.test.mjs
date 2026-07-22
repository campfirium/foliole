// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const appBuild = fs.readFileSync('android/app/build.gradle', 'utf8');

describe('Android core library desugaring contract', () => {
  it('keeps Java time APIs available below API 26', () => {
    expect(appBuild).toContain('coreLibraryDesugaringEnabled true');
    expect(appBuild).toContain("coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.5'");
  });
});
