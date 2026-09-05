// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS app identity host contract', () => {
  it('keeps production identity as the default and exposes only a suffix seam for acceptance', () => {
    const project = read('ios/App/App.xcodeproj/project.pbxproj');
    const bundleIdentifiers = Array.from(
      project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g),
      match => match[1]
    );

    expect(bundleIdentifiers).toEqual([
      '"com.foliole.ios$(FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX)"',
      '"com.foliole.ios$(FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX)"',
      '"com.foliole.ios.physical-uitests$(FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX)"',
      '"com.foliole.ios.physical-uitests$(FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX)"',
      '"com.foliole.ios.acceptance-projection-tests$(FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX)"',
      '"com.foliole.ios.acceptance-projection-tests$(FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX)"'
    ]);
    expect(project).not.toContain('FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX =');
  });

  it('compiles the sync-event projection only into the acceptance test target', () => {
    const project = read('ios/App/App.xcodeproj/project.pbxproj');
    const source = 'FolioleAcceptanceSyncEventProjectionTests.swift in Sources';
    const appSources = project.match(/504EC3001FED79650016851F \/\* Sources \*\/ = \{[\s\S]*?\n\t\t\};/)?.[0];
    const acceptanceSources = project.match(/50F110051FED79650016851F \/\* Sources \*\/ = \{[\s\S]*?\n\t\t\};/)?.[0];
    expect(appSources).not.toContain(source);
    expect(acceptanceSources).toContain(source);
    expect(read('ios/App/AppAcceptanceProjectionTests/FolioleAcceptanceSyncEventProjectionTests.swift'))
      .not.toMatch(/endpoint|workgroup_key|SELECT \*/u);
  });

  it('resolves the packaged identifier from the signed target setting', () => {
    const infoPlist = read('ios/App/App/Info.plist');

    expect(infoPlist).toContain('<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>');
    expect(infoPlist).not.toContain('com.foliole.ios');
  });

  it('forces both Fri two-device journeys onto a separate signed acceptance bundle', () => {
    for (const script of ['scripts/ios/macos-fri-two-device-sync.mjs',
      'scripts/ios/windows-fri-two-device-sync.mjs']) {
      const source = read(script);
      expect(source).toContain('FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX: bundle.suffix');
      expect(source).toContain('FOLIOLE_T152_MATRIX_ATTEMPT');
      expect(source).toContain("'--keep-app-foreground', bundle.applicationId");
    }
  });
});
