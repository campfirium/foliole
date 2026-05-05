import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  userDataPath: `/tmp/foliole-sync-objects-${Math.random().toString(16).slice(2)}`
}));

const syncDatabaseMock = vi.hoisted(() => ({
  applySyncObjects: vi.fn(() => ['setting:mobile:android:phone:*:handoff']),
  loadSyncIndex: vi.fn(() => [{
    content_hash: 'setting-hash',
    object_id: 'setting:theme',
    object_type: 'setting',
    sync_version_id: null,
    updated_at: '2026-04-25T00:00:00.000Z'
  }]),
  loadSyncObjects: vi.fn(() => [{
    content_hash: 'setting-hash',
    deleted_at: null,
    object_id: 'setting:theme',
    object_type: 'setting',
    payload_json: '{}',
    updated_at: '2026-04-25T00:00:00.000Z'
  }])
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => electronMock.userDataPath) },
  safeStorage: {
    decryptString: vi.fn((payload: Buffer) => payload.toString('utf8')),
    encryptString: vi.fn((payload: string) => Buffer.from(payload, 'utf8')),
    isEncryptionAvailable: vi.fn(() => true)
  }
}));

vi.mock('../database/workspaceSnapshot.js', () => ({ loadWorkspaceSnapshot: vi.fn(() => null) }));
vi.mock('../database/syncIndex.js', () => ({ loadSyncIndex: syncDatabaseMock.loadSyncIndex }));
vi.mock('../database/syncObjects.js', () => ({ loadSyncObjects: syncDatabaseMock.loadSyncObjects }));
vi.mock('../database/syncObjectApply.js', () => ({ applySyncObjects: syncDatabaseMock.applySyncObjects }));
vi.mock('../../lib/core/database/syncState.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/core/database/syncState.js')>();
  return {
    ...actual,
    listSyncChangesAfterCursor: vi.fn(() => [{
      appliedAt: '2026-04-25T00:00:01.000Z',
      baseVersionId: null,
      changeId: 'change-1',
      changeType: 'upsert',
      contentHash: 'setting-hash',
      createdAt: '2026-04-25T00:00:00.000Z',
      deviceId: 'desktop',
      objectId: 'setting:theme',
      objectType: 'setting',
      payloadJson: '{}',
      resultVersionId: null
    }])
  };
});

function signRequest(args: { bodyText?: string; deviceId: string; method: string; pathWithQuery: string; secret: string }) {
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash('sha256').update(args.bodyText ?? '').digest('hex');
  const canonical = [args.method, args.pathWithQuery, timestamp, nonce, bodyHash].join('\n');
  return {
    'X-Device-Id': args.deviceId,
    'X-Nonce': nonce,
    'X-Signature': crypto.createHmac('sha256', args.secret).update(canonical).digest('hex'),
    'X-Timestamp': timestamp
  };
}

async function pairDevice(endpoint: string) {
  const createResponse = await fetch(`${endpoint}/companion/pair-requests`, {
    body: JSON.stringify({ device_id: 'android-test-device', device_kind: 'android', device_name: 'Pixel Test' }),
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
  return (await finalizeResponse.json()) as { device_id: string; device_secret: string };
}

async function resetTestState() {
  const { stopLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
  await stopLanWorkspaceSyncServer();
  const { clearCompanionPairRequests } = await import('./companionPairingRequests.js');
  const { clearCompanionRequestNonceCache } = await import('./companionRequestAuth.js');
  clearCompanionPairRequests();
  clearCompanionRequestNonceCache();
  delete process.env.FOLIOLE_COMPANION_SYNC_PORT;
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-sync-objects-'));
}

describe('lan workspace sync objects', () => {
  afterEach(resetTestState);

  it('serves generic sync index and objects only for paired devices', async () => {
    process.env.FOLIOLE_COMPANION_SYNC_PORT = '38683';
    const { ensureLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
    await ensureLanWorkspaceSyncServer({ appVersion: '0.1.0-test', peerId: 'desktop-local' });

    expect((await fetch('http://127.0.0.1:38683/companion/sync-index')).status).toBe(401);

    const paired = await pairDevice('http://127.0.0.1:38683');
    const changesPath = '/companion/sync-changes?limit=500';
    const changesResponse = await fetch(`http://127.0.0.1:38683${changesPath}`, {
      headers: signRequest({ deviceId: paired.device_id, method: 'GET', pathWithQuery: changesPath, secret: paired.device_secret })
    });
    expect(changesResponse.status).toBe(200);
    await expect(changesResponse.json()).resolves.toMatchObject({
      changes: [{ change_id: 'change-1', object_id: 'setting:theme', object_type: 'setting' }]
    });

    const indexResponse = await fetch('http://127.0.0.1:38683/companion/sync-index', {
      headers: signRequest({ deviceId: paired.device_id, method: 'GET', pathWithQuery: '/companion/sync-index', secret: paired.device_secret })
    });
    expect(indexResponse.status).toBe(200);
    await expect(indexResponse.json()).resolves.toMatchObject({ entries: [{ object_id: 'setting:theme' }] });

    const pathWithQuery = '/companion/sync-objects?object_type=setting&object_id=setting%3Atheme';
    const objectsResponse = await fetch(`http://127.0.0.1:38683${pathWithQuery}`, {
      headers: signRequest({ deviceId: paired.device_id, method: 'GET', pathWithQuery, secret: paired.device_secret })
    });
    expect(objectsResponse.status).toBe(200);
    await expect(objectsResponse.json()).resolves.toMatchObject({ objects: [{ object_id: 'setting:theme' }] });
    expect(syncDatabaseMock.loadSyncObjects).toHaveBeenCalledWith(['setting:theme'], ['setting']);
  });

  it('accepts pushed generic sync objects from paired devices', async () => {
    process.env.FOLIOLE_COMPANION_SYNC_PORT = '38684';
    const { ensureLanWorkspaceSyncServer } = await import('./lanWorkspaceSyncServer.js');
    await ensureLanWorkspaceSyncServer({ appVersion: '0.1.0-test', peerId: 'desktop-local' });
    const paired = await pairDevice('http://127.0.0.1:38684');
    const bodyText = JSON.stringify({
      objects: [{
        content_hash: 'hash-mobile-setting',
        deleted_at: null,
        object_id: 'mobile:android:phone:*:handoff',
        object_type: 'setting',
        payload_json: '{"key":"handoff"}',
        updated_at: '2026-04-25T00:10:00.000Z'
      }]
    });
    const pathWithQuery = '/companion/sync-objects';

    const response = await fetch(`http://127.0.0.1:38684${pathWithQuery}`, {
      body: bodyText,
      headers: {
        'Content-Type': 'application/json',
        ...signRequest({ bodyText, deviceId: paired.device_id, method: 'POST', pathWithQuery, secret: paired.device_secret })
      },
      method: 'POST'
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      applied_object_ids: ['setting:mobile:android:phone:*:handoff']
    });
  });
});
