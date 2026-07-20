// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS bridge controller host contract', () => {
  it('boots the custom Capacitor controller that registers Foliole plugins', () => {
    const infoPlist = read('ios/App/App/Info.plist');
    const storyboard = read('ios/App/App/Base.lproj/Main.storyboard');
    const controller = read('ios/App/App/FolioleBridgeViewController.swift');

    expect(infoPlist).toContain('<key>UIMainStoryboardFile</key>\n\t<string>Main</string>');
    expect(storyboard).toContain('initialViewController="BYZ-38-t0r"');
    expect(storyboard).toContain(
      'id="BYZ-38-t0r" customClass="FolioleBridgeViewController" customModule="App"'
    );
    expect(controller).toContain('final class FolioleBridgeViewController: CAPBridgeViewController');
    expect(controller).toContain('override func capacitorDidLoad()');
  });

  it('compiles the custom controller into every App target build', () => {
    const project = read('ios/App/App.xcodeproj/project.pbxproj');

    expect(project).toContain('FolioleBridgeViewController.swift in Sources');
  });
});
