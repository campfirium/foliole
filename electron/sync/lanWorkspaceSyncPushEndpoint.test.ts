import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

import { createTestPairingKeyPair, decryptTestPairingSecret } from './companionPairingProtocolTestSupport.js';
import { postSigned } from './lanWorkspaceSyncObjects.testSupport.js';

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.cwd()}/.tmp/foliole-sync-push-endpoint-${Math.random().toString(16).slice(2)}`
}));
const pushApplyMock = vi.hoisted(() => ({
  applyCompanionSyncPushAsync: vi.fn(async () => ({
    acks: [{
      clientOpId: 'node_review:node-1:12',
      identity: { objectId: 'node-1', objectType: 'node_review', scope: 'workspace' },
      stateSeq: 42,
      status: 'accepted'
    }],
    appliedNodeIds: [],
    appliedObjectIds: ['node_review:node-1'],
    appliedReviewOpIds: []
  }))
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
vi.mock('../database/companionSyncPushAsyncApply.js', () => ({
  applyCompanionSyncPushAsync: pushApplyMock.applyCompanionSyncPushAsync
}));
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
      pairing_public_key: clientKeyPair.publicKey,
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
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
  pushApplyMock.applyCompanionSyncPushAsync.mockClear();
  syncAppliedEventsMock.notifyWorkspaceSyncApplied.mockClear();
  delete process.env.FOLIOLE_COMPANION_SYNC_PORT;
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'foliole-sync-push-endpoint-'));
}

function buildPushBody() {
  return JSON.stringify({
    items: [{
      base: { baseContentHash: 'desktop-base', kind: 'content_hash' },
      clientOpId: 'node_review:node-1:12',
      contentHash: 'android-next',
      deletedAt: null,
      identity: { objectId: 'node-1', objectType: 'node_review', scope: 'workspace' },
      payloadJson: '{"reps":2}',
      updatedAt: '2026-04-30T01:00:00.000Z'
    }]
  });
}

describe('lan workspace sync push endpoint', () => {
  afterEach(resetTestState);

  it('accepts signed push payloads on the new endpoint', async () => {
    process.env.FOLIOLE_COMPANION_SYNC_PORT = '38686';
    const { ensureLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
    await ensureLanWorkspaceSyncServer({ appVersion: '0.1.0-test', peerId: 'desktop-local' });
    const paired = await pairDevice('http://127.0.0.1:38686');

    const response = await postSigned('http://127.0.0.1:38686', '/companion/sync-push', buildPushBody(), paired);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      acks: [{
        client_op_id: 'node_review:node-1:12',
        identity: { objectId: 'node-1', objectType: 'node_review', scope: 'workspace' },
        state_seq: 42,
        status: 'accepted'
      }]
    });
    expect(pushApplyMock.applyCompanionSyncPushAsync).toHaveBeenCalledWith(JSON.parse(buildPushBody()).items);
    expect(syncAppliedEventsMock.notifyWorkspaceSyncApplied).toHaveBeenCalledWith({
      appliedNodeIds: [],
      appliedObjectIds: ['node_review:node-1'],
      appliedReviewOpIds: []
    });
  });

  it('keeps invalid push payloads out of desktop apply', async () => {
    process.env.FOLIOLE_COMPANION_SYNC_PORT = '38687';
    const { ensureLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
    await ensureLanWorkspaceSyncServer({ appVersion: '0.1.0-test', peerId: 'desktop-local' });
    const paired = await pairDevice('http://127.0.0.1:38687');

    const response = await postSigned('http://127.0.0.1:38687', '/companion/sync-push', '{"items":[{}]}', paired);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_sync_push_payload' });
    expect(pushApplyMock.applyCompanionSyncPushAsync).not.toHaveBeenCalled();
  });
});
