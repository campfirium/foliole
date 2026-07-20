// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS launch screen host contract', () => {
  it('keeps the declared launch storyboard in the App resources phase', () => {
    const infoPlist = read('ios/App/App/Info.plist');
    const storyboard = read('ios/App/App/Base.lproj/LaunchScreen.storyboard');
    const project = read('ios/App/App.xcodeproj/project.pbxproj');

    expect(infoPlist).toContain('<key>UILaunchStoryboardName</key>\n\t<string>LaunchScreen</string>');
    expect(storyboard).toContain('launchScreen="YES"');
    expect(storyboard).toContain('initialViewController="01J-lp-oVM"');
    expect(project).toContain('LaunchScreen.storyboard in Resources');
  });

  it('keeps every declared Splash scale backed by a bundled image', () => {
    const assetPath = path.join(root, 'ios/App/App/Assets.xcassets/Splash.imageset');
    const contents = JSON.parse(fs.readFileSync(path.join(assetPath, 'Contents.json'), 'utf8'));
    const filenames = contents.images.map((image) => image.filename);

    expect(filenames).toHaveLength(3);
    expect(new Set(contents.images.map((image) => image.scale))).toEqual(new Set(['1x', '2x', '3x']));
    expect(filenames.every((filename) => filename && fs.existsSync(path.join(assetPath, filename)))).toBe(true);
  });
});
