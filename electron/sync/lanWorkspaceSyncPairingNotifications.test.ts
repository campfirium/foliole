import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestPairingKeyPair } from './companionPairingProtocolTestSupport.js';

const electronMock = vi.hoisted(() => ({
  userDataPath: `/tmp/foliole-companion-pairing-${Math.random().toString(16).slice(2)}`
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath)
  },
  safeStorage: {
    decryptString: vi.fn((payload: Buffer) => payload.toString('utf8')),
    encryptString: vi.fn((payload: string) => Buffer.from(payload, 'utf8')),
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
  const { stopLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
  await stopLanWorkspaceSyncServer();
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  clearCompanionPairRequests();
  delete process.env.FOLIOLE_COMPANION_SYNC_PORT;
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-companion-pairing-'));
}

describe('lan workspace sync pairing notifications', () => {
  afterEach(resetTestState);

  it('notifies the desktop shell when a new pair request is created', async () => {
    const { ensureLanWorkspaceSyncServer, setLanWorkspaceSyncPairRequestHandler } = await import(
      './lanWorkspaceSyncServer.js'
    );
    const onPairRequestCreated = vi.fn();
    setLanWorkspaceSyncPairRequestHandler(onPairRequestCreated);
    const status = await ensureLanWorkspaceSyncServer({
      appVersion: '0.1.0',
      peerId: 'desktop-local'
    });
    const firstPairingKey = await createTestPairingKeyPair();
    const secondPairingKey = await createTestPairingKeyPair();
    const endpoint = `http://127.0.0.1:${status.port}`;

    const response = await fetch(`${endpoint}/companion/pair-requests`, {
      body: JSON.stringify({
        device_id: 'android-test-device',
        device_kind: 'android-capacitor',
        device_name: 'Android companion android-test-device',
        pairing_public_key: firstPairingKey.publicKey
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    });
    const duplicateResponse = await fetch(`${endpoint}/companion/pair-requests`, {
      body: JSON.stringify({
        device_id: 'android-test-device',
        device_kind: 'android-capacitor',
        device_name: 'Android companion android-test-device',
        pairing_public_key: secondPairingKey.publicKey
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    });

    expect(response.status).toBe(202);
    expect(duplicateResponse.status).toBe(409);
    expect(onPairRequestCreated).toHaveBeenCalledTimes(2);
  });
});
