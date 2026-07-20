// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS app identity host contract', () => {
  it('keeps every committed App configuration on the production bundle identity', () => {
    const project = read('ios/App/App.xcodeproj/project.pbxproj');
    const bundleIdentifiers = Array.from(
      project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g),
      match => match[1]
    );

    expect(bundleIdentifiers).toEqual(['com.foliole.ios', 'com.foliole.ios']);
  });

  it('resolves the packaged identifier from the signed target setting', () => {
    const infoPlist = read('ios/App/App/Info.plist');

    expect(infoPlist).toContain('<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>');
    expect(infoPlist).not.toContain('com.foliole.ios');
  });
});
