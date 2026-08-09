import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  callback: null as null | ((service: unknown) => void),
  completeJoin: vi.fn(),
  continueSync: vi.fn(),
  destroy: vi.fn(),
  group: { group_id: 'group-1' },
  peers: [{ endpoint_url: 'http://old', group_id: 'group-1', peer_device_id: 'android-b' }],
  savePeer: vi.fn((peer) => peer),
  stop: vi.fn(),
  refreshPending: vi.fn(() => false)
}));

vi.mock('bonjour-service', () => ({
  Bonjour: class {
    destroy = runtime.destroy;
    find(_query: unknown, callback: (service: unknown) => void) {
      runtime.callback = callback;
      return { stop: runtime.stop };
    }
  }
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => runtime.group }));
vi.mock('./companionPairingStore.js', () => ({
  loadPairedSyncGroupPeers: () => runtime.peers,
  savePairedSyncGroupPeer: runtime.savePeer
}));
vi.mock('./desktopSyncGroupJoin.js', () => ({
  completeDesktopSyncGroupJoin: runtime.completeJoin,
  continueDesktopSyncGroupSync: runtime.continueSync
}));
vi.mock('./desktopSyncGroupJoinState.js', () => ({
  refreshDesktopSyncGroupPendingJoinEndpoint: runtime.refreshPending
}));

import { startDesktopSyncGroupAutoSync, stopDesktopSyncGroupAutoSync } from './desktopSyncGroupAutoSync.js';

beforeEach(() => {
  stopDesktopSyncGroupAutoSync();
  vi.clearAllMocks();
  runtime.callback = null;
  runtime.completeJoin.mockResolvedValue({ group_id: 'group-1' });
  runtime.continueSync.mockResolvedValue({ complete: true, cursor: 9 });
  runtime.refreshPending.mockReturnValue(false);
});

it('continues the saved member sync when its provider advertises again', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({
    addresses: ['192.168.1.12'], port: 43121,
    txt: { group_id: 'group-1', peer_id: 'android-b' }
  });
  await vi.waitFor(() => expect(runtime.continueSync).toHaveBeenCalledOnce());
  expect(runtime.savePeer).toHaveBeenCalledWith(expect.objectContaining({
    endpoint_url: 'http://192.168.1.12:43121', peer_device_id: 'android-b'
  }));
});

it('continues an approved join at the same provider new endpoint', async () => {
  runtime.refreshPending.mockReturnValue(true);
  startDesktopSyncGroupAutoSync();
  runtime.callback?.({
    addresses: ['192.168.1.12'], port: 43122,
    txt: { group_id: 'group-1', peer_id: 'android-b', timeline_id: 'timeline-1' }
  });
  await vi.waitFor(() => expect(runtime.completeJoin).toHaveBeenCalledOnce());
  expect(runtime.refreshPending).toHaveBeenCalledWith({
    endpointUrl: 'http://192.168.1.12:43122', groupId: 'group-1',
    providerDeviceId: 'android-b', timelineId: 'timeline-1'
  });
  expect(runtime.continueSync).not.toHaveBeenCalled();
});
