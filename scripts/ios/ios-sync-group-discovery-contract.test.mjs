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
  const appDelegate = read('ios/App/App/AppDelegate.swift');

  expect(physicalTest).toContain('springboard.alerts.firstMatch');
  expect(physicalTest).not.toContain('addUIInterruptionMonitor');
  expect(physicalTest).not.toContain('alert.buttons[$0].tap()');
  expect(physicalTest).toContain('waitForLocalNetworkDecision(allow: true)');
  expect(physicalTest).toContain('NSPredicate(format: "exists == false")');
  expect(physicalTest).toContain('Fri-local-network-allow');
  expect(physicalTest).toContain('testPreparesLocalNetworkPermission()');
  expect(physicalTest).toContain('Fri-local-network-ready');
  expect(physicalTest).toContain('resetExistingSyncGroup(in: app)');
  expect(physicalTest).toContain('enableAutomaticSync(in: app)');
  expect(physicalTest).toContain('captureFriFact(in: app)');
  expect(physicalTest).toContain('waitForProviderAutomaticConvergence()');
  expect(physicalTest).toContain('waitForJourneyFacts(["A", "B", "C", "D"]');
  expect(physicalTest).toContain('"Leave Sync Group"');
  expect(physicalTest).toContain('["Allow", "允许"]');
  expect(physicalTest).toContain('"--foliole-physical-acceptance"');
  expect(appDelegate).toContain('arguments.contains("--foliole-physical-acceptance")');
  expect(appDelegate).toContain('application.isIdleTimerDisabled = true');
});
