import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { postSigned } from './lanWorkspaceSyncObjects.testSupport.js';
import { pairTestDevice } from './lanWorkspaceSyncServer.testSupport.js';

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.cwd()}/.tmp/foliole-sync-push-events-${Math.random().toString(16).slice(2)}`
}));
const syncAppliedEventsMock = vi.hoisted(() => ({ notifyWorkspaceSyncApplied: vi.fn() }));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => electronMock.userDataPath) },
  safeStorage: {
    decryptString: vi.fn((payload: Buffer) => payload.toString('utf8')),
    encryptString: vi.fn((payload: string) => Buffer.from(payload, 'utf8')),
    getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
    isEncryptionAvailable: vi.fn(() => true)
  }
}));
vi.mock('./workspaceSyncAppliedEvents.js', () => ({
  notifyWorkspaceSyncApplied: syncAppliedEventsMock.notifyWorkspaceSyncApplied
}));

async function resetTestState() {
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  const { clearCompanionRequestNonceCache } = await import('./companionRequestAuth.js');
  clearCompanionPairRequests();
  clearCompanionRequestNonceCache();
  syncAppliedEventsMock.notifyWorkspaceSyncApplied.mockClear();
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'foliole-sync-push-events-'));
}

async function expectRetiredNodeAndReviewPushes(server: http.Server, paired: { device_id: string; device_secret: string }) {
  const nodeResponse = await postSigned(
    server,
    '/companion/sync-node-versions',
    JSON.stringify({ nodes: [{ object_id: 'node-mobile', object_type: 'node' }] }),
    paired
  );
  expect(nodeResponse.status).toBe(410);
  expect(nodeResponse.json()).toEqual({ error: 'sync_json_endpoint_retired' });

  const reviewResponse = await postSigned(
    server,
    '/companion/sync-review-log',
    JSON.stringify({ reviews: [{ op_id: 'op-mobile' }] }),
    paired
  );
  expect(reviewResponse.status).toBe(410);
  expect(reviewResponse.json()).toEqual({ error: 'sync_json_endpoint_retired' });
}

describe('lan workspace sync push events', () => {
  afterEach(resetTestState);

  it('does not notify renderer windows for retired pushed node and review streams', async () => {
    const { createWorkspaceSyncHttpServer } = await import('./lanWorkspaceSyncServer.js');
    const server = createWorkspaceSyncHttpServer({ appVersion: '0.1.0-test', peerId: 'desktop-local' });
    const paired = await pairTestDevice(server);

    await expectRetiredNodeAndReviewPushes(server, paired);

    expect(syncAppliedEventsMock.notifyWorkspaceSyncApplied).not.toHaveBeenCalled();
  });
});
