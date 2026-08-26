import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  SYNC_GROUP_JOIN_LEGACY_CONSUMERS,
  SYNC_GROUP_JOIN_PREPARE_HOSTS,
  SYNC_GROUP_JOIN_REUSED_CRYPTO_HELPERS,
  syncGroupJoinPrepareMissingHosts
} from './syncGroupJoinPrepareInventory.js';

it('mechanically records every prepared host while activation stays gated', () => {
  expect(syncGroupJoinPrepareMissingHosts()).toEqual([]);
  for (const host of SYNC_GROUP_JOIN_PREPARE_HOSTS.filter((item) => item.status === 'prepared')) {
    expect(host.provider && existsSync(path.resolve(process.cwd(), host.provider))).toBe(true);
    expect(host.bridge && existsSync(path.resolve(process.cwd(), host.bridge))).toBe(true);
  }
  const ios = SYNC_GROUP_JOIN_PREPARE_HOSTS.find((item) => item.host === 'ios');
  expect(ios?.activation).toBe('inactive');
  expect(ios && 'projection' in ios && existsSync(path.resolve(process.cwd(), ios.projection))).toBe(true);
});

it('keeps every legacy consumer explicit for T152-7 retirement', () => {
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
  const ios = readFileSync(path.resolve(
    process.cwd(), 'ios/App/App/FolioleCompanionSyncGroupJoinProvider.swift'
  ), 'utf8');
  expect(desktop).not.toMatch(/PairingStore|MembershipApproval|registerSyncGroupMember/u);
  expect(android).not.toMatch(/JoinGrantStore|PeerStore|registerMember|authorization_id/u);
  expect(ios).not.toMatch(/PairingStore|JoinGrantStore|Member|authorization_id/u);
});
