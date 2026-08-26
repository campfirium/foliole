// @vitest-environment node

import fs from 'node:fs';

import { expect, it } from 'vitest';

it('keeps the iOS anchor device-local and outside ordinary production bridge activation', () => {
  const store = fs.readFileSync('ios/App/App/FolioleCompanionDeviceAnchorStore.swift', 'utf8');
  const controller = fs.readFileSync('ios/App/App/FolioleBridgeViewController.swift', 'utf8');
  const project = fs.readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');

  expect(store).toContain('kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly');
  expect(store).toContain('foliole.device-anchor.installation-marker.v1');
  expect(store).not.toMatch(/identifierForVendor|advertisingIdentifier|hostName/);
  expect(controller).toContain('#if FOLIOLE_IOS_BRIDGE_ACCEPTANCE && targetEnvironment(simulator)');
  expect(controller).toContain('FolioleCompanionDeviceAnchorStore().loadOrCreate()');
  expect(project).toContain('FolioleCompanionDeviceAnchorStore.swift in Sources');
});
