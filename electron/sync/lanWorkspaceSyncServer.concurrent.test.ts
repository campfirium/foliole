// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => {
  let releaseAdvertisement = () => {};
  return {
    advertise: vi.fn(() => new Promise<void>((resolve) => { releaseAdvertisement = resolve; })),
    releaseAdvertisement: () => releaseAdvertisement(),
    server: {
      close: vi.fn((callback?: (error?: Error) => void) => callback?.()),
      listen: vi.fn((_port: number, _host: string, callback: () => void) => callback()),
      once: vi.fn(), headersTimeout: 0, keepAliveTimeout: 0, requestTimeout: 0
    }
  };
});

vi.mock('node:http', () => ({ default: { createServer: () => runtime.server } }));
vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => ({ devices: [], group_id: 'group-test' })
}));
vi.mock('./companionLanRequestHandler.js', () => ({
  createLanWorkspaceSyncRequestHandler: () => (_request: unknown, response: { end: () => void }) => {
    response.end();
  },
  ATTACHMENT_RESOURCE_PATH: '/attachments',
  DISCOVERY_ENDPOINT_PATH: '/discovery',
  SYNC_GROUP_JOIN_ACCEPTANCE_PATH: '/accept',
  SYNC_GROUP_JOIN_REQUESTS_PATH: '/requests',
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
  startDesktopSyncGroupAutoSync: vi.fn(), stopDesktopSyncGroupAutoSync: vi.fn()
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

  runtime.releaseAdvertisement();
  const [firstStatus, secondStatus] = await Promise.all([first, second]);

  expect(runtime.advertise).toHaveBeenCalledOnce();
  expect(firstStatus.state).toBe('running');
  expect(secondStatus).toEqual(firstStatus);
});
