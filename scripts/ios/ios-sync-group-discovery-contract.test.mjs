// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

it('lands the generated continuous discovery inventory in both Capacitor hosts', () => {
  const contract = JSON.parse(read('ios/App/App/companion-bridge-contract-definitions.json'));
  const inventory = contract.hostApi.network.discoverySession;
  const swift = read('ios/App/App/FolioleCompanionSyncPlugin.swift');
  const java = read('android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPlugin.java');

  expect(inventory).toEqual({
    eventName: 'syncGroupDiscoveryChanged',
    startMethod: 'startDiscoverySession',
    stopMethod: 'stopDiscoverySession'
  });
  for (const value of Object.values(inventory)) {
    expect(swift).toContain(value);
    expect(java).toContain(value);
  }
});

it('keeps the Bonjour service declaration in the final iOS application plist', () => {
  const plist = read('ios/App/App/Info.plist');

  expect(plist).toContain('NSLocalNetworkUsageDescription');
  expect(plist).toContain('NSBonjourServices');
  expect(plist).toContain('_foliole-sync._tcp');
});

it('handles the iOS Local Network system card before waiting for a Device candidate', () => {
  const physicalTest = read(
    'ios/App/AppPhysicalUITests/FoliolePhysicalSyncGroupUITests.swift'
  );

  expect(physicalTest).toContain('XCUIApplication(bundleIdentifier: "com.apple.springboard")');
  expect(physicalTest).toContain('respondToLocalNetworkPrompt(allow: true, in: app)');
  expect(physicalTest).toContain('["Allow", "允许"]');
});
