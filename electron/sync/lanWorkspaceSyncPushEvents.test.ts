import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestPairingKeyPair, decryptTestPairingSecret } from './companionPairingProtocolTestSupport.js';
import { postSigned } from './lanWorkspaceSyncObjects.testSupport.js';

const electronMock = vi.hoisted(() => ({
  userDataPath: `/tmp/foliole-sync-push-events-${Math.random().toString(16).slice(2)}`
}));
const syncDatabaseMock = vi.hoisted(() => ({
  applySyncNodes: vi.fn(() => ['node-mobile']),
  applySyncReviewLog: vi.fn(() => ['op-mobile'])
}));
const syncAppliedEventsMock = vi.hoisted(() => ({ notifyWorkspaceSyncApplied: vi.fn() }));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => electronMock.userDataPath) },
  safeStorage: {
    decryptString: vi.fn((payload: Buffer) => payload.toString('utf8')),
    encryptString: vi.fn((payload: string) => Buffer.from(payload, 'utf8')),
    isEncryptionAvailable: vi.fn(() => true)
  }
}));
vi.mock('../database/syncApply.js', () => ({ applySyncNodes: syncDatabaseMock.applySyncNodes }));
vi.mock('../database/syncReviewLog.js', () => ({ applySyncReviewLog: syncDatabaseMock.applySyncReviewLog }));
vi.mock('./workspaceSyncAppliedEvents.js', () => ({
  notifyWorkspaceSyncApplied: syncAppliedEventsMock.notifyWorkspaceSyncApplied
}));

async function pairDevice(endpoint: string) {
  const clientKeyPair = await createTestPairingKeyPair();
  const createResponse = await fetch(`${endpoint}/companion/pair-requests`, {
    body: JSON.stringify({
      device_id: 'android-test-device',
      device_kind: 'android',
      device_name: 'Pixel Test',
      pairing_public_key: clientKeyPair.publicKey
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  const pairRequest = (await createResponse.json()) as { pair_request_id: string };
  const { approveCompanionPairRequest } = await import('./companionPairingRequests.js');
  approveCompanionPairRequest(pairRequest.pair_request_id);
  const finalizeResponse = await fetch(`${endpoint}/companion/pair`, {
    body: JSON.stringify({ pair_request_id: pairRequest.pair_request_id }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  const payload = await finalizeResponse.json() as {
    device_id: string;
    encrypted_device_secret: Parameters<typeof decryptTestPairingSecret>[0]['encrypted'];
  };
  return {
    device_id: payload.device_id,
    device_secret: await decryptTestPairingSecret({
      encrypted: payload.encrypted_device_secret,
      privateKey: clientKeyPair.privateKey
    })
  };
}

async function resetTestState() {
  const { stopLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
  await stopLanWorkspaceSyncServer();
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  const { clearCompanionRequestNonceCache } = await import('./companionRequestAuth.js');
  clearCompanionPairRequests();
  clearCompanionRequestNonceCache();
  syncAppliedEventsMock.notifyWorkspaceSyncApplied.mockClear();
  delete process.env.FOLIOLE_COMPANION_SYNC_PORT;
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-sync-push-events-'));
}

async function expectRetiredNodeAndReviewPushes(endpoint: string, paired: { device_id: string; device_secret: string }) {
  const nodeResponse = await postSigned(
    endpoint,
    '/companion/sync-node-versions',
    JSON.stringify({ nodes: [{ object_id: 'node-mobile', object_type: 'node' }] }),
    paired
  );
  expect(nodeResponse.status).toBe(410);
  await expect(nodeResponse.json()).resolves.toEqual({ error: 'sync_json_endpoint_retired' });

  const reviewResponse = await postSigned(
    endpoint,
    '/companion/sync-review-log',
    JSON.stringify({ reviews: [{ op_id: 'op-mobile' }] }),
    paired
  );
  expect(reviewResponse.status).toBe(410);
  await expect(reviewResponse.json()).resolves.toEqual({ error: 'sync_json_endpoint_retired' });
}

describe('lan workspace sync push events', () => {
  afterEach(resetTestState);

  it('does not notify renderer windows for retired pushed node and review streams', async () => {
    process.env.FOLIOLE_COMPANION_SYNC_PORT = '38685';
    const { ensureLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
    await ensureLanWorkspaceSyncServer({ appVersion: '0.1.0-test', peerId: 'desktop-local' });
    const paired = await pairDevice('http://127.0.0.1:38685');

    await expectRetiredNodeAndReviewPushes('http://127.0.0.1:38685', paired);

    expect(syncDatabaseMock.applySyncNodes).not.toHaveBeenCalled();
    expect(syncDatabaseMock.applySyncReviewLog).not.toHaveBeenCalled();
    expect(syncAppliedEventsMock.notifyWorkspaceSyncApplied).not.toHaveBeenCalled();
  });
});
