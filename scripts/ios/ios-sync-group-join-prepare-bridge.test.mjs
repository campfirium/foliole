// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

const read = (name) => fs.readFileSync(`ios/App/App/${name}`, 'utf8');

it('keeps the iOS join prepare Capacitor bridge complete but inactive', () => {
  const plugin = read('FolioleCompanionSyncGroupJoinPreparePlugin.swift');
  const provider = read('FolioleCompanionSyncGroupJoinProvider.swift');
  const controller = read('FolioleBridgeViewController.swift');
  expect(plugin).toContain('jsName = "FolioleSyncGroupJoinPrepare"');
  for (const method of [
    'receiveRequest', 'loadRequests', 'acceptRequest', 'collectAcceptance', 'rejectRequest'
  ]) {
    expect(plugin).toContain(`CAPPluginMethod(name: "${method}"`);
    expect(plugin).toContain(`@objc func ${method}(`);
  }
  expect(provider).toContain('sync_group_join_provider_unavailable');
  expect(controller).toMatch(
    /#if FOLIOLE_IOS_BRIDGE_ACCEPTANCE && targetEnvironment\(simulator\)[\s\S]*registerPluginInstance\(FolioleCompanionSyncGroupJoinPreparePlugin\(\)\)[\s\S]*#endif/u
  );
  expect(plugin).toContain('#if FOLIOLE_IOS_BRIDGE_ACCEPTANCE && targetEnvironment(simulator)');
});

it('keeps group delivery in the new provider without old authorization state', () => {
  const provider = read('FolioleCompanionSyncGroupJoinProvider.swift');
  const crypto = read('FolioleCompanionSyncGroupJoinCrypto.swift');
  expect(provider).toContain('"display_name", "group_id", "workgroup_key"');
  expect(crypto).toContain('ECDH-P256-HKDF-SHA256-AES-GCM');
  expect(provider).not.toMatch(/PairingStore|Member|authorization_id/u);
});
