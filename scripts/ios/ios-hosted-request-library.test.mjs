// @vitest-environment node
import { Buffer } from 'node:buffer';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath(name) { if (!sandbox.root) throw new Error('fixture_not_initialized'); return path.join(sandbox.root, name); },
  isPackaged: false
} }));

import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionMaintenance, runWithDatabaseConnectionOwner } from '../../electron/database/connection.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { desktopSyncGroupMemberStateReadiness, clearDesktopSyncGroupMemberStateReadiness, readDesktopVerifiedMemberState } from '../../electron/sync/desktopSyncGroupMemberStateReadiness.js';
import { IOS_HOSTED_PROVIDER_DEVICE_ID, IOS_HOSTED_SYNC_GROUP_ID } from '../../lib/platform/iosHostedSyncGroupContract.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { createCompanionSyncGroupJoinPublicKey, decryptCompanionSyncGroupJoinInfo, dropCompanionSyncGroupJoinPrivateKey } from '../../src/shared/platform/companionSyncGroupJoinEncryption.js';
import { createIosHostedRequestLibrary } from './ios-hosted-request-library.ts';
import { createIosSyncGroupProviderContract } from './ios-sync-group-provider-contract.ts';
import { createIosSyncGroupProviderObservations } from './ios-sync-group-provider-observations.ts';

const secret = Buffer.alloc(32, 9).toString('base64url');
const device = { canonical_library_path: '/acceptance/iphone.db', device_anchor: 'b1111111-1111-4111-8111-111111111111',
  device_name: 'Phone', path_flavor: 'posix', platform: 'ios-capacitor' };
afterEach(async () => {
  await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
  clearDesktopSyncGroupMemberStateReadiness(); dropCompanionSyncGroupJoinPrivateKey('hosted-request-test');
  vi.unstubAllEnvs();
  if (sandbox.root) fs.rmSync(sandbox.root, { recursive: true, force: true });
  sandbox.root = '';
});

it('registers the accepted member and returns the real provider epoch after a signed member exchange', async () => {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  sandbox.root = fs.mkdtempSync(path.resolve('.tmp/artifacts/hosted-request-library-'));
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(sandbox.root, 'library'));
  const databasePath = await runWithDatabaseConnectionOwner(() => {
    const connection = openDatabaseConnection(); initializeDatabaseSchema(connection.sqlite);
    connection.sqlite.prepare('UPDATE node_version_local_proof_state SET library_epoch = ?').run('provider-epoch');
    return connection.dbPath;
  });
  const library = await createIosHostedRequestLibrary({ databasePath, workgroupKey: secret });
  const provider = createIosSyncGroupProviderContract(createIosSyncGroupProviderObservations(), {
    workgroupKey: secret, registerAcceptedDevice: library.registerAcceptedDevice
  });
  const requested = await provider.accept({ contract_version: 1, device, group_id: IOS_HOSTED_SYNC_GROUP_ID,
    ephemeral_public_key: await createCompanionSyncGroupJoinPublicKey('hosted-request-test') });
  const accepted = provider.collect(requested.request_id);
  const info = JSON.parse(await decryptCompanionSyncGroupJoinInfo('hosted-request-test', accepted.encrypted_group_info));
  expect(info.workgroup_key).toBe(secret);
  const peerId = createSyncGroupDeviceIdentity({ group_id: IOS_HOSTED_SYNC_GROUP_ID,
    device_anchor: device.device_anchor, library_path: device.canonical_library_path, path_flavor: 'posix' }).identity_key;
  const local = await library.memberState();
  expect(local.devices.find(row => row.device_identity_key === peerId)).toMatchObject({ state: 'active', device_name: 'Phone' });
  const incoming = { ...local, sender_device_identity_key: peerId, library_epoch: 'phone-epoch' };
  const body = JSON.stringify(incoming);
  const request = signedRequest(peerId, body);
  expect(provider.authenticate(request, body)).toBe(true);
  const result = await library.acceptMemberState(body, peerId);
  expect(result).toMatchObject({ normalSyncReady: true, state: { library_epoch: 'provider-epoch', sender_device_identity_key: IOS_HOSTED_PROVIDER_DEVICE_ID } });
  expect(desktopSyncGroupMemberStateReadiness(peerId)).toBe('normal');
  expect(readDesktopVerifiedMemberState(peerId).library_epoch).toBe('phone-epoch');
  await expect(library.acceptMemberState(body, 'wrong-device')).rejects.toThrow('sync_group_member_state_identity_mismatch');
});

function signedRequest(peerId, body) {
  const timestamp = new Date().toISOString(), nonce = 'hosted-member-1', route = '/sync-group/member-state';
  const signature = createHmac('sha256', secret).update(['POST', route, timestamp, nonce,
    createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex');
  return { method: 'POST', url: route, headers: { 'x-device-id': peerId, 'x-sync-group-id': IOS_HOSTED_SYNC_GROUP_ID,
    'x-timestamp': timestamp, 'x-nonce': nonce, 'x-signature': signature } };
}

it('rejects a library outside the isolated attempt root before opening it', async () => {
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.resolve('.tmp/artifacts/hosted-boundary-only'));
  await expect(createIosHostedRequestLibrary({ databasePath: path.resolve('.tmp/outside-fixture.db'), workgroupKey: secret }))
    .rejects.toThrow('ios_hosted_request_library_mismatch');
  expect(fs.existsSync('.tmp/outside-fixture.db')).toBe(false);
});
