import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

import { createTestPairingKeyPair } from './companionPairingProtocolTestSupport.js';
import { requestWorkspaceSyncServer } from './lanWorkspaceSyncServer.testSupport.js';

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.cwd()}/.tmp/foliole-companion-pairing-${Math.random().toString(16).slice(2)}`
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

async function resetTestState() {
  const { setLanWorkspaceSyncPairRequestHandler } = await import('./lanWorkspaceSyncServer.js');
  setLanWorkspaceSyncPairRequestHandler(null);
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  clearCompanionPairRequests();
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'foliole-companion-pairing-'));
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
      body: {
        device_id: 'android-test-device',
        device_kind: 'android-capacitor',
        device_name: 'Android companion android-test-device',
        pairing_public_key: firstPairingKey.publicKey,
        protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
      },
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      path: '/companion/pair-requests'
    });
    const duplicateResponse = await requestWorkspaceSyncServer(server, {
      body: {
        device_id: 'android-test-device',
        device_kind: 'android-capacitor',
        device_name: 'Android companion android-test-device',
        pairing_public_key: secondPairingKey.publicKey,
        protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
      },
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      path: '/companion/pair-requests'
    });

    expect(response.status).toBe(202);
    expect(duplicateResponse.status).toBe(409);
    expect(onPairRequestCreated).toHaveBeenCalledTimes(2);
  });
});
