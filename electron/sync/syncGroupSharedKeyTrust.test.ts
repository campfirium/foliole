import { createHash, createHmac } from 'node:crypto';
import type http from 'node:http';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import {
  applyDesktopSyncGroupMemberState,
  initiateDesktopSyncGroupDeviceRemoval,
  loadDesktopSyncGroupMemberState
} from '../database/syncGroupMemberStateStore.js';
import { createDesktopSyncGroup, loadDesktopSyncGroup, registerSyncGroupDevice } from '../database/syncGroupStore.js';

import { authenticateCompanionRequest, clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { clearDesktopSyncGroupMemberStateReadiness, markDesktopSyncGroupMemberStateReady } from './desktopSyncGroupMemberStateReadiness.js';

const connection = vi.hoisted(() => ({ current: null as unknown as { driver: unknown } }));
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => connection.current }));

const KEY = Buffer.alloc(32, 4).toString('base64url');
const NOW = Date.parse('2026-10-04T01:00:00.000Z');
const identities = [1, 2, 3].map((index) => createSyncGroupDeviceIdentity({
  device_anchor: `${index}`.repeat(8) + '-1111-4111-8111-111111111111',
  group_id: 'group-1', library_path: `/security-test/${index}`, path_flavor: 'posix'
}));
let database: Database.Database;

beforeEach(() => {
  database = new Database(':memory:');
  initializeDatabaseSchema(database);
  connection.current = { driver: createBetterSqlite3Driver(database) };
  createDesktopSyncGroup({ device: identities[0]!, deviceName: 'Victim', platform: 'desktop', workgroupKey: KEY });
  registerSyncGroupDevice({ device: identities[1]!, deviceName: 'Removed', platform: 'desktop' });
  initiateDesktopSyncGroupDeviceRemoval(identities[1]!.identity_key);
});

afterEach(() => {
  database.close();
  clearCompanionRequestNonceCache();
  clearDesktopSyncGroupMemberStateReadiness();
});

function signedRequest(deviceId: string, nonce: string, body = '', key = KEY) {
  const timestamp = new Date(NOW).toISOString();
  const path = body ? '/sync-group/member-state' : '/companion/workspace-version';
  const method = body ? 'POST' : 'GET';
  const canonical = [method, path, timestamp, nonce, createHash('sha256').update(body).digest('hex')].join('\n');
  return {
    headers: {
      'x-device-id': deviceId, 'x-sync-group-id': 'group-1', 'x-timestamp': timestamp,
      'x-nonce': nonce, 'x-signature': createHmac('sha256', key).update(canonical).digest('hex')
    }, method, url: path
  } as unknown as http.IncomingMessage;
}

function unknownSnapshot() {
  const incoming = loadDesktopSyncGroupMemberState();
  incoming.sender_device_identity_key = identities[2]!.identity_key;
  incoming.devices = [{
    ...incoming.devices[0]!, device_identity_key: identities[2]!.identity_key,
    device_anchor: identities[2]!.device_anchor,
    canonical_library_path: identities[2]!.canonical_library_path, device_name: 'Unapproved'
  }];
  incoming.removals = [];
  return incoming;
}

// These characterize the intentional single-user, shared-key trust model.
// Member removal is not credential revocation or compromised-device isolation.
it('rejects the removed identity and wrong key but accepts a fresh identity holding the retained key', () => {
  expect(authenticateCompanionRequest({ nowMs: NOW,
    request: signedRequest(identities[1]!.identity_key, 'removed')
  })).toMatchObject({ ok: false, error: 'sync_group_device_not_active' });
  const incoming = unknownSnapshot();
  const bodyText = JSON.stringify(incoming);
  expect(authenticateCompanionRequest({ allowUnknownDevice: true, bodyText, nowMs: NOW,
    request: signedRequest(identities[2]!.identity_key, 'wrong-key', bodyText, 'wrong-key')
  })).toMatchObject({ ok: false, error: 'invalid_signature' });
  const auth = authenticateCompanionRequest({ allowUnknownDevice: true, bodyText, nowMs: NOW,
    request: signedRequest(identities[2]!.identity_key, 'new-member', bodyText)
  });
  expect(auth.ok).toBe(true);
  applyDesktopSyncGroupMemberState(incoming, identities[2]!.identity_key);
  expect(loadDesktopSyncGroup()?.devices.find((device) =>
    device.device_identity_key === identities[2]!.identity_key)?.state).toBe('active');
  markDesktopSyncGroupMemberStateReady(identities[2]!.identity_key);
  expect(authenticateCompanionRequest({ nowMs: NOW, requireMemberState: true,
    request: signedRequest(identities[2]!.identity_key, 'data-access')
  })).toMatchObject({ ok: true });
});

it('applies a shared-key holder member-state removal to the local device', () => {
  const incoming = unknownSnapshot();
  incoming.removals = [{ decision_id: 'shared-key-exit', target_device_identity_key: identities[0]!.identity_key,
    initiated_by_device_identity_key: identities[2]!.identity_key,
    created_at: new Date(NOW).toISOString(), completed_at: null, superseded_at: null, confirmations: [] }];
  const bodyText = JSON.stringify(incoming);
  expect(authenticateCompanionRequest({ allowUnknownDevice: true, bodyText, nowMs: NOW,
    request: signedRequest(identities[2]!.identity_key, 'local-exit', bodyText)
  })).toMatchObject({ ok: true });
  expect(applyDesktopSyncGroupMemberState(incoming, identities[2]!.identity_key).localExited).toBe(true);
  expect(database.prepare('SELECT state FROM sync_group_local_state WHERE singleton_id = 1').get())
    .toBeUndefined();
  expect(database.prepare('SELECT state FROM sync_group_devices WHERE device_identity_key = ?')
    .get(identities[0]!.identity_key)).toEqual({ state: 'left' });
});

it('accepts a retained-key signature relabeled as an active identity without the unknown-device exception', () => {
  const request = signedRequest(identities[1]!.identity_key, 'relabel');
  request.headers['x-device-id'] = identities[0]!.identity_key;
  markDesktopSyncGroupMemberStateReady(identities[0]!.identity_key);
  expect(authenticateCompanionRequest({ nowMs: NOW, requireMemberState: true, request }))
    .toMatchObject({ ok: true, device_id: identities[0]!.identity_key });
});

it('preserves explicit approved rejoining of a removed identity', () => {
  registerSyncGroupDevice({ device: identities[1]!, deviceName: 'Approved again', platform: 'desktop' });
  expect(authenticateCompanionRequest({ nowMs: NOW,
    request: signedRequest(identities[1]!.identity_key, 'approved-rejoin')
  })).toMatchObject({ ok: true });
});
