import { createHmac } from 'node:crypto';
import type http from 'node:http';

import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(async (args: { authenticate: () => unknown }) => { void args; })
}));

vi.mock('../database/betterSqliteDbPort.js', () => ({
  createBetterSqliteDbPort: vi.fn(() => ({}))
}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: vi.fn(() => ({ sqlite: {} })),
  runWithDatabaseConnectionOwner: vi.fn((run: () => unknown) => run())
}));
vi.mock('./workspaceSyncAppliedEvents.js', () => ({
  notifyWorkspaceSyncApplied: vi.fn()
}));
vi.mock('../database/desktopFramedSyncSessionStaging.js', () => ({
  createDesktopFramedSyncSessionNoncePort: vi.fn(() => ({}))
}));
vi.mock('../database/desktopFramedSyncStaging.js', () => ({
  createDesktopFramedSyncStaging: vi.fn(() => ({}))
}));
vi.mock('../database/nodeVersionPeerProof.js', () => ({
  loadDesktopLocalNodeProof: vi.fn(() => ({ library_epoch: 'desktop-epoch' }))
}));
vi.mock('../database/backupRestorePendingSync.js', () => ({
  loadBackupRestorePendingSync: vi.fn(() => null)
}));
vi.mock('../database/syncGroupMemberStateStore.js', () => ({
  isDesktopSyncGroupDeviceBlocked: vi.fn(() => false)
}));
vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: vi.fn(() => ({
    devices: [{ device_identity_key: 'android-a', device_name: 'A5', state: 'active' }],
    group_id: 'group-a'
  })),
  loadDesktopSyncGroupInfo: vi.fn(() => ({ workgroup_key: 'a'.repeat(43) }))
}));
vi.mock('./desktopSyncGroupMemberStateReadiness.js', () => ({
  isDesktopSyncGroupMemberStateReady: vi.fn(() => true)
}));
vi.mock('./workgroupKeyStore.js', () => ({
  consumeDesktopWorkgroupNonce: vi.fn(() => true),
  loadDesktopWorkgroupKey: vi.fn(() => ({ group_key: 'android-production-secret' }))
}));
vi.mock('./companionLanFramedSyncPost.js', () => ({
  FRAMED_SYNC_BODY_SHA256_HEADER: 'x-foliole-body-sha256',
  FRAMED_SYNC_PATH: '/companion/framed-sync',
  handleCompanionLanFramedSyncPost: mocks.handle
}));
import { handleProductionCompanionFramedSyncPost } from './companionLanFramedSyncRoute.js';

it('verifies the production framed request against its declared binary body hash', async () => {
  const bodySha256 = 'b'.repeat(64);
  const nonce = 'android-nonce';
  const pathWithQuery = '/companion/framed-sync?initiator_device_id=android-a' +
    '&initiator_library_epoch=android-epoch&responder_device_id=desktop-a' +
    '&responder_library_epoch=desktop-epoch';
  const timestamp = new Date().toISOString();
  const signature = createHmac('sha256', 'android-production-secret').update([
    'POST', pathWithQuery, timestamp, nonce, bodySha256
  ].join('\n')).digest('hex');
  const request = {
    headers: {
      'x-device-id': 'android-a',
      'x-foliole-body-sha256': bodySha256,
      'x-nonce': nonce,
      'x-signature': signature,
      'x-sync-group-id': 'group-a',
      'x-timestamp': timestamp
    },
    method: 'POST',
    url: pathWithQuery
  } as unknown as http.IncomingMessage;

  await handleProductionCompanionFramedSyncPost({
    deviceId: 'desktop-a', request, response: {} as http.ServerResponse
  });

  const handlerArgs = mocks.handle.mock.calls[0]?.[0];
  expect(handlerArgs?.authenticate()).toEqual({
    device_id: 'android-a', device_name: 'A5', ok: true
  });
});
