// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const iconSetPath = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath));

describe('iOS app icon host contract', () => {
  it('keeps a single universal 1024-point iOS icon source', () => {
    const contents = JSON.parse(read(`${iconSetPath}/Contents.json`).toString('utf8'));

    expect(contents.images).toEqual([{
      filename: 'AppIcon-512@2x.png',
      idiom: 'universal',
      platform: 'ios',
      size: '1024x1024'
    }]);
  });

  it('keeps the source PNG at the declared 1024-by-1024 pixel size', () => {
    const icon = read(`${iconSetPath}/AppIcon-512@2x.png`);

    expect(icon.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(icon.readUInt32BE(16)).toBe(1024);
    expect(icon.readUInt32BE(20)).toBe(1024);
  });

  it('keeps the App target compiling the named icon catalog', () => {
    const project = read('ios/App/App.xcodeproj/project.pbxproj').toString('utf8');

    expect(project).toContain('ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;');
    expect(project).toContain('Assets.xcassets in Resources');
  });
});
