// @vitest-environment node

import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let userDataDir = '';
const nativePlugin = vi.hoisted(() => ({
  desktopHttpRequest: vi.fn(),
  loadPairingState: vi.fn(),
  savePairingCredentials: vi.fn(),
  signCompanionSyncRequest: vi.fn()
}));
const syncGroupMock = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'android',
    isNativePlatform: () => true
  },
  registerPlugin: () => nativePlugin
}));

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  safeStorage: {
    decryptString: (value: Buffer) => value.toString('utf8'),
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    getSelectedStorageBackend: () => 'gnome_libsecret',
    isEncryptionAvailable: () => true
  }
}));

vi.mock('./companion/sync/syncGroupStore', async (importOriginal) => ({
  ...await importOriginal<typeof import('./companion/sync/syncGroupStore')>(),
  loadCompanionSyncGroup: syncGroupMock.load
}));

import { createLanWorkspaceSyncRequestHandler } from '../../../electron/sync/companionLanRequestHandler.js';
import {
  approveCompanionPairRequest,
  clearCompanionPairRequests
} from '../../../electron/sync/companionPairingRequests.js';
import {
  clearPairedCompanionDevices,
  countPairedCompanionDevices,
  loadPairedCompanionDevice
} from '../../../electron/sync/companionPairingStore.js';
import type { NativeCompanionPairingState } from '../../../lib/platform/nativeCompanionSyncContract';

import {
  pairCompanionWithDesktop,
  requestCompanionPairing
} from './companionWorkspaceSync';

let server: http.Server | null = null;
let endpointUrl = '';
let pairingState: NativeCompanionPairingState | null = null;

beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pairing-seam-'));
  clearCompanionPairRequests();
  clearPairedCompanionDevices();
  pairingState = null;
  syncGroupMock.load.mockResolvedValue(null);
  configureNativePairingStore();
  server = http.createServer(createLanWorkspaceSyncRequestHandler({
    appVersion: '0.1.0-test',
    onPairRequestCreated: null,
    peerId: 'desktop-test',
    updatePairingStatus: () => undefined
  }));
  endpointUrl = await listen(server);
  nativePlugin.desktopHttpRequest.mockImplementation(requestThroughLanHandler);
});

afterEach(async () => {
  vi.restoreAllMocks();
  clearCompanionPairRequests();
  clearPairedCompanionDevices();
  if (server) await close(server);
  await fs.rm(userDataDir, { recursive: true, force: true });
  server = null;
});

it('connects the native pairing client to the desktop LAN handler', async () => {
  const pending = await requestPairing();
  expect(approveCompanionPairRequest(pending.pair_request_id)).not.toBeNull();

  const completed = await completePairing(pending.pair_request_id);

  expect(countPairedCompanionDevices()).toBe(1);
  expect(loadPairedCompanionDevice('android-seam')).toMatchObject({ device_id: 'android-seam' });
  expect(completed).toMatchObject({ is_paired: true, sync_usable: true });
});

it('lets an approved request complete after pending polls fill a 60 second window', async () => {
  const now = vi.spyOn(Date, 'now');
  const startedAt = Date.parse('2026-08-05T01:00:00.000Z');
  now.mockReturnValue(startedAt);
  const pending = await requestPairing();
  for (let index = 0; index < 10; index += 1) {
    now.mockReturnValue(startedAt + index * 5_000);
    await expect(completePairing(pending.pair_request_id)).rejects.toMatchObject({ code: 'pair_request_pending' });
  }
  now.mockReturnValue(startedAt + 50_000);
  expect(approveCompanionPairRequest(pending.pair_request_id)).not.toBeNull();

  await expect(completePairing(pending.pair_request_id)).resolves.toMatchObject({ sync_usable: true });
  expect(countPairedCompanionDevices()).toBe(1);
});

it('keeps an approved request completable across the original 120 second expiry', async () => {
  const now = vi.spyOn(Date, 'now');
  const startedAt = Date.parse('2026-08-05T02:00:00.000Z');
  now.mockReturnValue(startedAt);
  const pending = await requestPairing();
  now.mockReturnValue(startedAt + 119_000);
  expect(approveCompanionPairRequest(pending.pair_request_id)).not.toBeNull();
  now.mockReturnValue(startedAt + 121_000);

  await expect(completePairing(pending.pair_request_id)).resolves.toMatchObject({ sync_usable: true });
  expect(countPairedCompanionDevices()).toBe(1);
});

function configureNativePairingStore() {
  nativePlugin.loadPairingState.mockImplementation(async () => pairingState ?? { is_paired: false });
  nativePlugin.savePairingCredentials.mockImplementation(async (value: NativeCompanionPairingState) => {
    pairingState = { ...value, is_paired: true };
    return pairingState;
  });
  nativePlugin.signCompanionSyncRequest.mockResolvedValue({
    headers: {
      'X-Authorization-Id': 'android-seam',
      'X-Nonce': 'nonce',
      'X-Signature': 'signature',
      'X-Timestamp': '2026-08-05T00:00:00.000Z'
    }
  });
}

async function requestPairing() {
  return await requestCompanionPairing({
    deviceId: 'android-seam',
    deviceKind: 'android',
    deviceName: 'A5',
    endpointUrl
  });
}

async function completePairing(pairRequestId: string) {
  return await pairCompanionWithDesktop({
    deviceKind: 'android',
    deviceName: 'A5',
    endpointUrl,
    pairRequestId
  });
}

async function requestThroughLanHandler(args: {
  body?: string;
  headers?: Record<string, string>;
  method: string;
  url: string;
}) {
  const response = await fetch(args.url, {
    ...(args.body === undefined ? {} : { body: args.body }),
    ...(args.headers === undefined ? {} : { headers: args.headers }),
    method: args.method
  });
  return { body: await response.text(), status: response.status };
}

async function listen(target: http.Server) {
  await new Promise<void>((resolve, reject) => {
    target.once('error', reject);
    target.listen(0, '127.0.0.1', resolve);
  });
  const address = target.address();
  if (!address || typeof address === 'string') throw new Error('pairing_seam_server_address_unavailable');
  return `http://127.0.0.1:${address.port}`;
}

async function close(target: http.Server) {
  await new Promise<void>((resolve, reject) => target.close((error) => error ? reject(error) : resolve()));
}
