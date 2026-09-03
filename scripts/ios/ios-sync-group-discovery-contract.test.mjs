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
  const physicalTest = [
    'ios/App/AppPhysicalUITests/FoliolePhysicalSyncGroupUITests.swift',
    'ios/App/AppPhysicalUITests/FoliolePhysicalSyncGroupUITestSupport.swift',
    'ios/App/AppPhysicalUITests/FoliolePhysicalSyncGroupMutationUITestSupport.swift'
  ].map(read).join('\n');
  const appDelegate = read('ios/App/App/AppDelegate.swift');

  expect(physicalTest).toContain('springboard.alerts.firstMatch');
  expect(physicalTest).not.toContain('addUIInterruptionMonitor');
  expect(physicalTest).not.toContain('alert.buttons[$0].tap()');
  expect(physicalTest).toContain('waitForLocalNetworkDecision(allow: true)');
  expect(physicalTest).toContain('decision.tap()');
  expect(physicalTest).toContain('NSPredicate(format: "exists == false")');
  expect(physicalTest).toContain('Fri-local-network-allow');
  expect(physicalTest).toContain('testPreparesLocalNetworkPermission()');
  expect(physicalTest).toContain('Fri-local-network-ready');
  expect(physicalTest).toContain('resetExistingSyncGroup(in: app)');
  expect(physicalTest).toContain('enableAutomaticSync(in: app)');
  expect(physicalTest).toContain('captureFriFact(in: app)');
  expect(physicalTest).not.toContain('Data(contentsOf: URL(fileURLWithPath:');
  expect(physicalTest).not.toContain('Thread.sleep(forTimeInterval:');
  expect(physicalTest).toContain('FOLIOLE_T152_TWO_DEVICE');
  expect(physicalTest).toContain('waitForJourneyFactCount("A", count: 2');
  expect(physicalTest).toContain('[foliole-fri] t152-conflict-fork-ready');
  expect(physicalTest).toContain('"Pause Sync"');
  expect(physicalTest).toContain('"Resume Sync"');
  expect(physicalTest).toContain('"Issues to resolve"');
  expect(physicalTest).toContain('tapEnabledButton(named: "Sync Now"');
  expect(physicalTest).toContain('isTwoDeviceJourney ? ["A", "B"] : ["A", "B", "C", "D"]');
  expect(physicalTest).toContain('"Leave Sync Group"');
  expect(physicalTest).toContain('["Allow", "允许"]');
  expect(physicalTest).toContain('"--foliole-physical-acceptance"');
  expect(physicalTest).toContain('testShowsRequestedSyncGroupDevices()');
  expect(physicalTest).toContain('testCapturesRequestedFact()');
  expect(physicalTest).toContain('testWaitsForRequestedFact()');
  expect(physicalTest).toContain('testWaitsForRequestedTopicText()');
  expect(physicalTest).toContain('testAppendsToRequestedTopic()');
  expect(physicalTest).toContain('testCreatesAndEditsRequestedHighlight()');
  expect(physicalTest).toContain('testRestoresRequestedTopicFromTrash()');
  expect(physicalTest).toContain('testPausesAutomaticSync()');
  expect(physicalTest).toContain('testPullsRequestedFactWithSyncNow()');
  expect(physicalTest).toContain('testResumesAutomaticSync()');
  expect(physicalTest).toContain('testRestoresGroupAndRequestedFactAfterRelaunch()');
  expect(physicalTest).toContain('testStopsForForegroundCatchUp()');
  expect(physicalTest).toContain('FOLIOLE_PHYSICAL_DEVICE_NAMES');
  expect(physicalTest).toContain('FOLIOLE_PHYSICAL_FACT_TITLE');
  expect(physicalTest).toContain('FOLIOLE_PHYSICAL_TOPIC_PREFIX');
  expect(physicalTest).toContain('FOLIOLE_PHYSICAL_APPEND_TEXT');
  expect(physicalTest).toContain('FOLIOLE_PHYSICAL_EXPECTED_TEXT');
  expect(physicalTest).toContain('FOLIOLE_PHYSICAL_SELECTION_TEXT');
  expect(physicalTest).toContain('FOLIOLE_PHYSICAL_ANNOTATION_NOTE');
  expect(physicalTest).toContain('FOLIOLE_PHYSICAL_TRASH_TITLE');
  expect(physicalTest).toContain('tapButton(named: "Join", in: app, timeout: 90)');
  expect(physicalTest).toContain('app.wait(for: .notRunning');
  expect(physicalTest).not.toMatch(/coordinate\s*:/u);
  expect(appDelegate).toContain('arguments.contains("--foliole-physical-acceptance")');
  expect(appDelegate).toContain('application.isIdleTimerDisabled = true');
});
