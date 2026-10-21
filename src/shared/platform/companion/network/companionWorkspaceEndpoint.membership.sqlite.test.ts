// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort';
import { bootstrapCompanionDatabase } from '../../../../../lib/core/database/companionDatabaseLifecycle';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { createSyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract';
import { joinCompanionSyncGroup } from '../sync/syncGroupStore';

import { resolveReachableCompanionWorkspaceSyncEndpoints } from './companionWorkspaceEndpoint';

const runtime = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), discover: vi.fn() }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: runtime.read, runWriter: runtime.write })
}));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  isNativeCompanionNetworkRuntime: () => true,
  normalizeEndpointUrl: (value: string) => value,
  WORKSPACE_VERSION_PATH: '/api/workspace/version'
}));
vi.mock('../../companionWorkspaceDiscovery', () => ({ discoverCompanionDesktops: runtime.discover }));

const databases: Database.Database[] = [];
const roots: string[] = [];
afterEach(() => {
  databases.splice(0).forEach(db => db.close());
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
  vi.clearAllMocks();
});

async function openLibrary() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-join-target-'));
  roots.push(root);
  const database = new Database(path.join(root, 'companion.db'));
  databases.push(database);
  const db = createBetterSqliteDbPort(database);
  await bootstrapCompanionDatabase(db, {
    allowCreate: true, expectedHostName: 'Phone', now: '2026-10-21T00:00:00Z'
  });
  runtime.read.mockImplementation((task: (port: DbPort) => Promise<unknown>) => task(db));
  runtime.write.mockImplementation((task: (port: DbPort) => Promise<unknown>) => task(db));
}

it('has no native synchronization target before group membership exists', async () => {
  await openLibrary();
  expect(await resolveReachableCompanionWorkspaceSyncEndpoints('http://mac:38641')).toEqual([]);
  expect(runtime.discover).not.toHaveBeenCalled();
});

it('discovers the same endpoint with member identity after joining the group', async () => {
  await openLibrary();
  const device = createSyncGroupDeviceIdentity({ device_anchor: '11111111-1111-4111-8111-111111111111', group_id: 'group',
    library_path: '/phone', path_flavor: 'posix' });
  const provider = createSyncGroupDeviceIdentity({ device_anchor: '22222222-2222-4222-8222-222222222222', group_id: 'group',
    library_path: '/mac', path_flavor: 'posix' });
  await joinCompanionSyncGroup({ mode: 'use-group', endpointUrl: 'http://mac:38641', device,
    deviceName: 'Phone', displayName: 'Group', platform: 'ios-capacitor',
    provider: { device: provider, deviceName: 'Mac', platform: 'macOS' }, workgroupKey: 'test-key' });
  runtime.discover.mockResolvedValue([{ compatibility: { status: 'compatible' },
    endpointUrl: 'http://mac:38641', discovery: { group_id: 'group',
      provider_device_id: provider.identity_key, provider_device_name: 'Mac', provider_platform: 'macOS' } }]);
  expect(await resolveReachableCompanionWorkspaceSyncEndpoints('http://mac:38641')).toEqual([
    expect.objectContaining({ endpointUrl: 'http://mac:38641', groupId: 'group', deviceId: provider.identity_key })
  ]);
});
