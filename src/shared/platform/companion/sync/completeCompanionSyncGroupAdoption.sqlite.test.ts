// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort';
import { bootstrapCompanionDatabase } from '../../../../../lib/core/database/companionDatabaseLifecycle';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { beginSyncGroupLocalAdoption } from '../../../../../lib/core/sync/syncGroupLocalAdoption';
import type { CompanionSyncGroupDataRequest } from '../../../../../lib/platform/companionSyncGroupDataContract';

const native = vi.hoisted(() => ({
  listener: null as null | ((request: CompanionSyncGroupDataRequest) => void),
  resolve: vi.fn(), read: vi.fn(), adopt: vi.fn(), exchange: vi.fn()
}));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {
  addListener: async (_name: string, listener: (request: CompanionSyncGroupDataRequest) => void) => {
    await Promise.resolve();
    native.listener = listener;
    return { remove: async () => undefined };
  },
  resolveSyncGroupDataRequest: native.resolve
} }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: native.read })
}));
vi.mock('../network/companionSyncGroupMemberState', () => ({
  exchangeCompanionSyncGroupMemberState: native.exchange
}));
vi.mock('./framed/companionSyncGroupLocalAdoption', () => ({
  adoptCompanionSyncGroupData: native.adopt
}));

import { completeCompanionSyncGroupAdoption } from './completeCompanionSyncGroupAdoption';

const databases: Database.Database[] = [];
const roots: string[] = [];
afterEach(() => {
  databases.splice(0).forEach(db => db.close());
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

it('answers native credential requests during first adoption before a provider has started', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-first-adoption-'));
  roots.push(root);
  const database = new Database(path.join(root, 'fri.db'));
  databases.push(database);
  const db = createBetterSqliteDbPort(database);
  await bootstrapCompanionDatabase(db, {
    allowCreate: true, expectedHostName: 'Fri', now: '2026-10-09T00:00:00Z'
  });
  await db.run(`INSERT INTO sync_groups VALUES ('group-1', 'Group', 'key', 'now', 'now')`);
  await db.run(`INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'fri', 'active', 'now')`);
  await db.run(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
     platform, state, joined_at, updated_at)
    VALUES ('group-1', 'fri', 'anchor', '/library', 'Fri', 'ios-capacitor', 'active', 'now', 'now')`);
  await beginSyncGroupLocalAdoption(db, {
    endpointUrl: 'http://mac:38641', groupId: 'group-1', libraryEpoch: 'adoption',
    providerDeviceId: 'mac', providerDeviceName: 'Mac', providerPlatform: 'macOS'
  });
  native.read.mockImplementation((task: (port: DbPort) => Promise<unknown>) => task(db));
  native.exchange.mockResolvedValue({
    localExited: false, peerRemoved: false, normalSyncReady: true, peerLibraryEpoch: 'mac-epoch'
  });
  native.adopt.mockImplementation(() => nativeCredentialRequest());

  await expect(completeCompanionSyncGroupAdoption()).resolves.toBeUndefined();
  expect(native.resolve).toHaveBeenCalledWith({
    request_id: 'native-credential', result: { device_id: 'fri', workgroup_key: 'key' }
  });
});

function nativeCredentialRequest() {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('sync_group_data_request_timed_out')), 1_000);
    native.resolve.mockImplementation((response: { error?: string }) => {
      clearTimeout(timeout);
      if (response.error) reject(new Error(response.error)); else resolve();
    });
    native.listener?.({ operation: 'load_current_credential', request_id: 'native-credential',
      payload: { group_id: 'group-1' } });
  });
}
