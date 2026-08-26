import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  SYNC_GROUP_JOIN_ACTIVE_HOSTS,
  SYNC_GROUP_JOIN_CRYPTO_HELPERS,
  SYNC_GROUP_JOIN_RETIRED_CONSUMERS,
  syncGroupJoinMissingActiveHosts
} from './syncGroupJoinPrepareInventory.js';

it('mechanically records every active Sync Group join host', () => {
  expect(syncGroupJoinMissingActiveHosts()).toEqual([]);
  for (const host of SYNC_GROUP_JOIN_ACTIVE_HOSTS) {
    expect(existsSync(path.resolve(process.cwd(), host.provider)), host.provider).toBe(true);
    expect(existsSync(path.resolve(process.cwd(), host.bridge)), host.bridge).toBe(true);
  }
});

it('keeps every retired production consumer absent after cutover', () => {
  for (const file of SYNC_GROUP_JOIN_RETIRED_CONSUMERS) {
    expect(existsSync(path.resolve(process.cwd(), file)), file).toBe(false);
  }
});

it('uses only Group/Device join crypto without old authorization stores', () => {
  for (const file of SYNC_GROUP_JOIN_CRYPTO_HELPERS) {
    expect(existsSync(path.resolve(process.cwd(), file)), file).toBe(true);
  }
  for (const file of SYNC_GROUP_JOIN_ACTIVE_HOSTS.map((host) => host.provider)) {
    const source = readFileSync(path.resolve(process.cwd(), file), 'utf8');
    expect(source).not.toMatch(/PairingStore|MembershipApproval|registerSyncGroupMember|authorization_id/u);
  }
});
