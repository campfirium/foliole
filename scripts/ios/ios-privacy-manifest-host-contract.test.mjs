// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('iOS privacy manifest host contract', () => {
  it('declares only the app-local UserDefaults required reason', () => {
    const manifest = read('ios/App/App/PrivacyInfo.xcprivacy');

    expect(manifest).toContain('<key>NSPrivacyAccessedAPITypes</key>');
    expect(manifest).toContain('<string>NSPrivacyAccessedAPICategoryUserDefaults</string>');
    expect(manifest).toContain('<string>CA92.1</string>');
    expect(manifest.match(/NSPrivacyAccessedAPICategory/g)).toHaveLength(1);
    expect(manifest).not.toContain('NSPrivacyTracking');
    expect(manifest).not.toContain('NSPrivacyCollectedDataTypes');
  });

  it('keeps the manifest bundled at the app root', () => {
    const project = read('ios/App/App.xcodeproj/project.pbxproj');
    const packageSource = read('ios/App/Package.swift');

    expect(project).toContain('PrivacyInfo.xcprivacy */ = {isa = PBXFileReference;');
    expect(project).toContain('PrivacyInfo.xcprivacy in Resources */');
    expect(packageSource).toContain('"PrivacyInfo.xcprivacy"');
  });

  it('anchors the declaration to direct app-owned UserDefaults usage', () => {
    expect(read('ios/App/App/FolioleCompanionBootstrapPlugin.swift')).toContain('UserDefaults.standard');
    expect(read('ios/App/App/FolioleCompanionPairingStore.swift')).toContain('UserDefaults(suiteName: suite)');
  });
});
