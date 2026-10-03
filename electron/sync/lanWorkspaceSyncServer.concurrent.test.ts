// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => {
  let releaseAdvertisement = () => {};
  return {
    advertise: vi.fn(() => new Promise<void>((resolve) => { releaseAdvertisement = resolve; })),
    startAutoSync: vi.fn(),
    stopAutoSync: vi.fn(),
    loadGroup: vi.fn(() => ({ devices: [], group_id: 'group-test' })),
    releaseAdvertisement: () => releaseAdvertisement(),
    server: {
      close: vi.fn((callback?: (error?: Error) => void) => callback?.()),
      listen: vi.fn((_port: number, _host: string, callback: () => void) => callback()),
      once: vi.fn(), headersTimeout: 0, keepAliveTimeout: 0, requestTimeout: 0
    }
  };
});

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('node:http', () => ({ default: { createServer: () => runtime.server } }));
vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: runtime.loadGroup
}));
vi.mock('./companionLanRequestHandler.js', () => ({
  createLanWorkspaceSyncRequestHandler: () => (_request: unknown, response: { end: () => void }) => {
    response.end();
  },
  ATTACHMENT_RESOURCE_PATH: '/attachments',
  DISCOVERY_ENDPOINT_PATH: '/discovery',
  SYNC_GROUP_JOIN_ACCEPTANCE_PATH: '/accept',
  SYNC_GROUP_JOIN_REQUESTS_PATH: '/requests',
  SYNC_GROUP_MEMBER_STATE_PATH: '/member-state',
  SYNC_DIAGNOSTICS_PATH: '/diagnostics',
  SYNC_PACK_PATH: '/sync-pack',
  WORKSPACE_SNAPSHOT_PATH: '/snapshot',
  WORKSPACE_VERSION_PATH: '/version'
}));
vi.mock('./companionMdnsAdvertisement.js', () => ({
  stopCompanionMdnsAdvertisement: vi.fn()
}));
vi.mock('./desktopAnchorTopologyRole.js', () => ({
  loadDesktopAnchorTopologyState: () => ({ role: 'anchor', status: 'ready' })
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: () => true
}));
vi.mock('./desktopDnsSdDiagnostics.js', () => ({ logDesktopDnsSdDiagnostic: vi.fn() }));
vi.mock('./desktopSyncGroupAdvertisement.js', () => ({
  advertiseDesktopSyncGroup: runtime.advertise
}));
vi.mock('./desktopSyncGroupAutoSync.js', () => ({
  startDesktopSyncGroupAutoSync: runtime.startAutoSync, stopDesktopSyncGroupAutoSync: runtime.stopAutoSync
}));
vi.mock('./desktopSyncGroupJoinProvider.js', () => ({
  loadDesktopSyncGroupJoinProvider: () => null
}));
vi.mock('./lanWorkspaceSyncNetwork.js', () => ({ collectLanWorkspaceSyncUrls: () => [] }));
vi.mock('./workgroupKeyStore.js', () => ({ loadDesktopWorkgroupKey: () => ({}) }));

import {
  ensureLanWorkspaceSyncServer, stopLanWorkspaceSyncServer
} from './lanWorkspaceSyncServer.js';

afterEach(async () => {
  runtime.releaseAdvertisement();
  await stopLanWorkspaceSyncServer();
  vi.clearAllMocks();
});

it('shares one listener start across concurrent recovery requests', async () => {
  const identity = { appVersion: '1.0.0', deviceId: 'desktop-a' };
  const first = ensureLanWorkspaceSyncServer(identity);
  await vi.waitFor(() => expect(runtime.advertise).toHaveBeenCalledOnce());
  const second = ensureLanWorkspaceSyncServer(identity);
  const groupReadsBeforeAdvertisement = runtime.loadGroup.mock.calls.length;

  runtime.releaseAdvertisement();
  const [firstStatus, secondStatus] = await Promise.all([first, second]);

  expect(runtime.advertise).toHaveBeenCalledOnce();
  expect(runtime.loadGroup).toHaveBeenCalledTimes(groupReadsBeforeAdvertisement);
  expect(firstStatus.state).toBe('running');
  expect(secondStatus).toEqual(firstStatus);
});

it('finishes a requested stop after an in-flight advertisement settles', async () => {
  const starting = ensureLanWorkspaceSyncServer({ appVersion: '1.0.0', deviceId: 'desktop-a' });
  await vi.waitFor(() => expect(runtime.advertise).toHaveBeenCalledOnce());
  const stopping = stopLanWorkspaceSyncServer();
  runtime.releaseAdvertisement();
  await starting;
  expect((await stopping).state).toBe('stopped');
  expect(runtime.server.close).toHaveBeenCalledOnce();
});

it('honors stop before the asynchronous startup check returns', async () => {
  const starting = ensureLanWorkspaceSyncServer({ appVersion: '1.0.0', deviceId: 'desktop-a' });
  const stopping = stopLanWorkspaceSyncServer();
  await vi.waitFor(() => expect(runtime.advertise).toHaveBeenCalledOnce());
  runtime.releaseAdvertisement();
  await starting;
  expect((await stopping).state).toBe('stopped');
  expect(runtime.server.close).toHaveBeenCalledOnce();
  expect(runtime.stopAutoSync.mock.invocationCallOrder.at(-1))
    .toBeGreaterThan(runtime.startAutoSync.mock.invocationCallOrder.at(-1)!);
});
