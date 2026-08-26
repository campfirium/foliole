import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  SYNC_GROUP_JOIN_LEGACY_CONSUMERS,
  SYNC_GROUP_JOIN_PREPARE_HOSTS,
  SYNC_GROUP_JOIN_REUSED_CRYPTO_HELPERS,
  syncGroupJoinPrepareMissingHosts
} from './syncGroupJoinPrepareInventory.js';

it('mechanically records prepared hosts and the gated iOS stage', () => {
  expect(syncGroupJoinPrepareMissingHosts()).toEqual(['ios']);
  for (const host of SYNC_GROUP_JOIN_PREPARE_HOSTS.filter((item) => item.status === 'prepared')) {
    expect(host.provider && existsSync(path.resolve(process.cwd(), host.provider))).toBe(true);
    expect(host.bridge && existsSync(path.resolve(process.cwd(), host.bridge))).toBe(true);
  }
});

it('keeps every legacy consumer explicit for T152-6 retirement', () => {
  expect(SYNC_GROUP_JOIN_LEGACY_CONSUMERS.length).toBeGreaterThan(10);
  for (const file of SYNC_GROUP_JOIN_LEGACY_CONSUMERS) {
    expect(existsSync(path.resolve(process.cwd(), file)), file).toBe(true);
  }
});

it('reuses crypto helpers without letting new providers consume old authorization stores', () => {
  for (const file of SYNC_GROUP_JOIN_REUSED_CRYPTO_HELPERS) {
    expect(existsSync(path.resolve(process.cwd(), file)), file).toBe(true);
  }
  const desktop = readFileSync(path.resolve(
    process.cwd(), 'electron/sync/syncGroupJoinPrepareProvider.ts'
  ), 'utf8');
  const android = readFileSync(path.resolve(
    process.cwd(), 'android/app/src/main/java/com/foliole/android/FolioleCompanionJoinRequestProvider.java'
  ), 'utf8');
  expect(desktop).not.toMatch(/PairingStore|MembershipApproval|registerSyncGroupMember/u);
  expect(android).not.toMatch(/JoinGrantStore|PeerStore|registerMember|authorization_id/u);
});
