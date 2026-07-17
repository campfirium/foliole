import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { postSigned } from './lanWorkspaceSyncObjects.testSupport.js';
import { pairTestDevice } from './lanWorkspaceSyncServer.testSupport.js';

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

async function resetTestState() {
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  const { clearCompanionRequestNonceCache } = await import('./companionRequestAuth.js');
  clearCompanionPairRequests();
  clearCompanionRequestNonceCache();
  pushApplyMock.applyCompanionSyncPushAsync.mockClear();
  syncAppliedEventsMock.notifyWorkspaceSyncApplied.mockClear();
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
    const { createWorkspaceSyncHttpServer } = await import('./lanWorkspaceSyncServer.js');
    const server = createWorkspaceSyncHttpServer({ appVersion: '0.1.0-test', peerId: 'desktop-local' });
    const paired = await pairTestDevice(server);

    const response = await postSigned(server, '/companion/sync-push', buildPushBody(), paired);

    expect(response.status).toBe(200);
    expect(response.json()).toEqual({
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
    const { createWorkspaceSyncHttpServer } = await import('./lanWorkspaceSyncServer.js');
    const server = createWorkspaceSyncHttpServer({ appVersion: '0.1.0-test', peerId: 'desktop-local' });
    const paired = await pairTestDevice(server);

    const response = await postSigned(server, '/companion/sync-push', '{"items":[{}]}', paired);

    expect(response.status).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_sync_push_payload' });
    expect(pushApplyMock.applyCompanionSyncPushAsync).not.toHaveBeenCalled();
  });
});
