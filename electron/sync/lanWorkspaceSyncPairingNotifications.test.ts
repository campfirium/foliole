import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

import { createTestPairingKeyPair } from './companionPairingProtocolTestSupport.js';
import { requestWorkspaceSyncServer } from './lanWorkspaceSyncServer.testSupport.js';

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.cwd()}/.tmp/foliole-companion-pairing-${Math.random().toString(16).slice(2)}`
}));
const workgroupKeyMock = vi.hoisted(() => ({
  group_key: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  group_tag: '630dcd2966c4336691125448bbb25b4f'
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath)
  },
  safeStorage: {
    decryptString: vi.fn((payload: Buffer) => payload.toString('utf8')),
    encryptString: vi.fn((payload: string) => Buffer.from(payload, 'utf8')),
    getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
    isEncryptionAvailable: vi.fn(() => true)
  }
}));

vi.mock('./companionMdnsAdvertisement.js', () => ({
  startCompanionMdnsAdvertisement: vi.fn(),
  stopCompanionMdnsAdvertisement: vi.fn()
}));

vi.mock('../database/workspaceSnapshot.js', () => ({
  loadWorkspaceVersionMetadata: vi.fn(),
  loadWorkspaceSnapshot: vi.fn()
}));

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: vi.fn(async (execute: () => unknown) => execute())
}));

vi.mock('../database/syncGroupStore.js', () => ({
  isActiveSyncGroupMember: vi.fn(() => false),
  loadDesktopSyncGroup: vi.fn(() => ({
    created_at: '2026-08-08T00:00:00.000Z',
    created_by_device_id: 'desktop-local',
    display_name: 'Foliole Desktop',
    group_id: 'group-test',
    local_device_id: 'desktop-local',
    local_member_state: 'active',
    members: [],
    timeline_id: 'timeline-test'
  }))
}));

vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: vi.fn(() => workgroupKeyMock)
}));

async function resetTestState() {
  const { setLanWorkspaceSyncPairRequestHandler } = await import('./lanWorkspaceSyncServer.js');
  setLanWorkspaceSyncPairRequestHandler(null);
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  clearCompanionPairRequests();
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'foliole-companion-pairing-'));
}

function pairRequestBody(pairingPublicKey: string) {
  return {
    device_id: 'android-test-device',
    device_kind: 'android-capacitor',
    device_name: 'Android companion android-test-device',
    group_id: 'group-test',
    group_tag: workgroupKeyMock.group_tag,
    library_facts: {
      attachment_count: 0,
      content_blob_count: 0,
      node_count: 0,
      review_log_count: 0,
      timeline_id: null
    },
    pairing_public_key: pairingPublicKey,
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    timeline_id: 'timeline-test'
  };
}

describe('lan workspace sync pairing notifications', () => {
  afterEach(resetTestState);

  it('notifies the desktop shell when a new pair request is created', async () => {
    const { createWorkspaceSyncHttpServer, setLanWorkspaceSyncPairRequestHandler } = await import(
      './lanWorkspaceSyncServer.js'
    );
    const onPairRequestCreated = vi.fn();
    setLanWorkspaceSyncPairRequestHandler(onPairRequestCreated);
    const server = createWorkspaceSyncHttpServer({
      appVersion: '0.1.0',
      peerId: 'desktop-local'
    });
    const firstPairingKey = await createTestPairingKeyPair();
    const secondPairingKey = await createTestPairingKeyPair();

    const response = await requestWorkspaceSyncServer(server, {
      body: pairRequestBody(firstPairingKey.publicKey),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      path: '/companion/pair-requests'
    });
    const duplicateResponse = await requestWorkspaceSyncServer(server, {
      body: pairRequestBody(secondPairingKey.publicKey),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      path: '/companion/pair-requests'
    });

    expect(response.status).toBe(202);
    expect(duplicateResponse.status).toBe(409);
    expect(onPairRequestCreated).toHaveBeenCalledTimes(2);
  });
});
