// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';
import { IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL } from '../ipc/contracts.js';

import { createTestPairingKeyPair } from './companionPairingProtocolTestSupport.js';
import { requestWorkspaceSyncServer } from './lanWorkspaceSyncServer.testSupport.js';

const electronMock = vi.hoisted(() => ({
  userDataPath: `${process.cwd()}/.tmp/foliole-pairing-main-${Math.random().toString(16).slice(2)}`
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath),
    getVersion: vi.fn(() => '0.1.0-test')
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

vi.mock('../database/deviceIdentity.js', () => ({
  loadOrCreateDesktopDeviceId: vi.fn(() => 'desktop-local')
}));

vi.mock('../database/primaryDeviceCommit.js', () => ({
  commitPrimaryDeviceToPeer: vi.fn()
}));

vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncEnabled: vi.fn(() => true),
  setDesktopCompanionSyncEnabled: vi.fn()
}));

vi.mock('./primaryDeviceState.js', () => ({
  loadDesktopPrimaryDeviceStatePayload: vi.fn(() => ({
    can_initiate_takeover: false,
    local_role: 'primary',
    primary_device_id: 'desktop-local',
    source: 'committed-primary-device',
    takeover_blocked_reasons: []
  }))
}));

vi.mock('../database/workspaceSnapshot.js', () => ({
  loadWorkspaceSnapshot: vi.fn(),
  loadWorkspaceVersionMetadata: vi.fn()
}));

async function resetRuntimeState() {
  vi.useRealTimers();
  const requests = await import('./companionPairingRequests.js');
  requests.clearCompanionPairRequests();
  const server = await import('./lanWorkspaceSyncServer.js');
  server.setLanWorkspaceSyncPairRequestHandler(null);
  await server.stopLanWorkspaceSyncServer();
  const database = await import('../database/connection.js');
  database.closeDatabaseConnection();
  fs.rmSync(electronMock.userDataPath, { force: true, recursive: true });
  electronMock.userDataPath = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'foliole-pairing-main-'));
}

async function postPairRequest(server: ReturnType<typeof import('./lanWorkspaceSyncServer.js')['createWorkspaceSyncHttpServer']>) {
  const pairingKey = await createTestPairingKeyPair();
  return requestWorkspaceSyncServer(server, {
    body: {
      device_id: 'fixed-android-device',
      device_kind: 'android-capacitor',
      device_name: 'Fixed Android companion',
      pairing_public_key: pairingKey.publicKey,
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
    },
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    path: '/companion/pair-requests'
  });
}

describe('companion pairing main-process state ownership', () => {
  afterEach(resetRuntimeState);

  it('makes an accepted LAN request visible to notification, server status, and IPC overview', async () => {
    const lifecycle = await import('../mainWindowLifecycle.js');
    const serverRuntime = await import('./lanWorkspaceSyncServer.js');
    const commands = await import('../ipc/companionPairingCommands.js');
    const send = vi.fn();
    lifecycle.installPairingFocusHandler(async () => ({ webContents: { send } }) as never);
    const server = serverRuntime.createWorkspaceSyncHttpServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });

    const response = await postPairRequest(server);
    const overview = await commands.handleCompanionPairingCommand(
      NATIVE_COMMANDS.loadCompanionPairingOverview,
      {}
    );

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledWith(IPC_COMPANION_PAIRING_REQUESTS_CHANGED_CHANNEL);
    expect(serverRuntime.getLanWorkspaceSyncServerStatus().pending_pair_request_count).toBe(1);
    expect(overview).toMatchObject({
      pending_requests: [{ device_id: 'fixed-android-device', status: 'pending' }],
      server_status: { pending_pair_request_count: 1 }
    });
  });

  it('does not manufacture consistency across duplicate, stop, expiry, or module-runtime boundaries', async () => {
    const firstRuntime = await import('./lanWorkspaceSyncServer.js');
    const firstCommands = await import('../ipc/companionPairingCommands.js');
    const server = firstRuntime.createWorkspaceSyncHttpServer({
      appVersion: '0.1.0-test',
      peerId: 'desktop-local'
    });
    expect((await postPairRequest(server)).status).toBe(202);
    expect((await postPairRequest(server)).status).toBe(409);

    await firstRuntime.stopLanWorkspaceSyncServer();
    await expect(firstCommands.handleCompanionPairingCommand(
      NATIVE_COMMANDS.loadCompanionPairingOverview,
      {}
    )).resolves.toMatchObject({
      pending_requests: [{ device_id: 'fixed-android-device' }],
      server_status: { pending_pair_request_count: 1, state: 'stopped' }
    });

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 121_000);
    await expect(firstCommands.handleCompanionPairingCommand(
      NATIVE_COMMANDS.loadCompanionPairingOverview,
      {}
    )).resolves.toMatchObject({
      pending_requests: [],
      server_status: { pending_pair_request_count: 0 }
    });

    vi.useRealTimers();
    expect(firstRuntime.getLanWorkspaceSyncServerStatus().pending_pair_request_count).toBe(0);
  });
});
