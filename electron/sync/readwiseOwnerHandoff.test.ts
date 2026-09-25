import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  localId: 'new-device', mode: 'api' as 'api' | 'relay',
  ownerId: 'old-device' as string | null, ownerEpoch: 0,
  remoteReachable: true, stopStatus: 'stopped' as 'stopped' | 'pending',
  blockedReason: null as null | 'handoff-in-progress',
  guard: null as null | { epoch: number; groupId: string; mode: 'api' | 'relay';
    ownerId: string; state: 'active' | 'relinquished'; targetId: string | null }
}));
const writes = vi.hoisted(() => ({ guard: vi.fn(), owner: vi.fn(), resume: vi.fn() }));
const intent = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
const stopOrder = vi.hoisted(() => [] as string[]);
const PEER = { endpoint_url: 'http://old-device', group_id: 'group',
  local_device_id: 'new-device', peer_device_id: 'old-device', peer_device_name: 'Old', peer_platform: 'macOS' };

vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ dbPath: '/test/library.db' }),
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  activateReadwiseOnThisHost: () => ({ is_active: true }),
  canPrepareReadwiseOnThisHost: () => true,
  loadReadwiseHostAssignment: () => ({
    active_device_identity_key: state.ownerId, active_owner_epoch: state.ownerEpoch,
    activation_blocked_reason: state.blockedReason,
    current_host_name: 'New', is_active: state.ownerId === state.localId && !state.blockedReason
  })
}));
vi.mock('../database/readwiseOwnerGuard.js', () => ({
  loadReadwiseOwnerGuard: () => state.guard,
  saveReadwiseOwnerGuard: (guard: typeof state.guard) => { state.guard = guard; writes.guard(guard); }
}));
vi.mock('../database/readwiseSourceMode.js', () => ({
  loadReadwiseSourceModeState: () => ({ conflictReasons: [], mode: state.mode })
}));
vi.mock('../database/settingsStore.js', () => ({
  saveJsonSetting: (key: string, value: { device_identity_key: string; epoch: number }) => {
    writes.owner(key, value);
    state.ownerId = value.device_identity_key;
    state.ownerEpoch = value.epoch;
    state.blockedReason = null;
  }
}));
vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => ({ group_id: 'group', local_device_identity_key: state.localId,
    devices: [{ device_identity_key: 'old-device', platform: 'macOS', state: 'active' },
      { device_identity_key: 'new-device', platform: 'Windows 11', state: 'active' }] })
}));
vi.mock('./desktopSyncGroupHttp.js', () => ({
  createDesktopWorkgroupPost: ({ body }: { body: string }) => ({ body, headers: {} }),
  readDesktopWorkgroupResponse: async ({ response }: { response: Response }) =>
    Buffer.from(await response.text())
}));
vi.mock('./desktopSyncGroupMemberState.js', () => ({
  exchangeDesktopSyncGroupMemberState: async () => ({ localExited: false, peerBlocked: false })
}));
vi.mock('./desktopSyncGroupMemberStateSession.js', () => ({
  loadDesktopSyncGroupMemberEndpoints: () => [PEER]
}));
vi.mock('./desktopSyncGroupPeerCompatibility.js', () => ({
  assertDesktopSyncGroupPeerCompatible: async () => undefined
}));
vi.mock('./readwiseOwnerStop.js', () => ({
  READWISE_OWNER_STOP_PATH: '/companion/readwise-owner-stop',
  handleReadwiseOwnerStop: (body: string) => {
    stopOrder.push('local');
    const request = JSON.parse(body) as Record<string, unknown>;
    return { ...request, status: state.stopStatus, oldDeviceId: state.localId };
  },
  resumeReadwiseExecutionAfterActivation: writes.resume
}));
vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: () => ({ group_key: 'group-key' })
}));
vi.mock('./readwiseHandoffIntent.js', () => ({
  loadReadwiseHandoffIntent: () => intent.current,
  saveReadwiseHandoffIntent: (value: Record<string, unknown> | null) => { intent.current = value; }
}));

import { activateReadwiseWithHandoff, continuePendingReadwiseHandoff } from './readwiseOwnerHandoff.js';

beforeEach(() => {
  state.ownerId = 'old-device';
  state.ownerEpoch = 0;
  state.remoteReachable = true;
  state.stopStatus = 'stopped';
  state.blockedReason = null;
  state.guard = null;
  intent.current = null;
  stopOrder.length = 0;
  Object.values(writes).forEach((mock) => mock.mockReset());
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    stopOrder.push('remote');
    if (!state.remoteReachable) throw new Error('offline');
    const request = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ ...request, status: state.stopStatus,
      oldDeviceId: 'old-device' }), { status: 200 });
  }));
});

it('writes a new owner only after an exact stop ACK from the old desktop', async () => {
  await expect(activateReadwiseWithHandoff()).resolves.toMatchObject({ is_active: true });
  expect(writes.guard).toHaveBeenCalledWith(expect.objectContaining({
    epoch: 1, ownerId: 'new-device', state: 'active'
  }));
  expect(writes.owner).toHaveBeenCalledWith('readwise_active_host', expect.objectContaining({
    device_identity_key: 'new-device', epoch: 1
  }));
  expect(writes.resume).toHaveBeenCalledTimes(1);
});

it('confirms an automatic current owner through a stopped self handoff', async () => {
  state.ownerId = state.localId;
  await expect(activateReadwiseWithHandoff({
    forceCurrent: true, selectionSource: 'chosen'
  })).resolves.toMatchObject({ is_active: true });
  expect(stopOrder).toEqual(['local']);
  expect(writes.owner).toHaveBeenCalledWith('readwise_active_host',
    expect.objectContaining({ epoch: 1, selection_source: 'chosen' }));
});

it('keeps the old owner and a durable intent when the old desktop is offline', async () => {
  state.remoteReachable = false;
  await expect(activateReadwiseWithHandoff()).resolves.toMatchObject({ is_active: false });
  expect(state.ownerId).toBe('old-device');
  expect(writes.owner).not.toHaveBeenCalled();
  expect(writes.guard).not.toHaveBeenCalled();
  expect(intent.current).toMatchObject({ targetId: 'new-device', ownerId: 'old-device' });
  state.remoteReachable = true;
  await expect(continuePendingReadwiseHandoff()).resolves.toMatchObject({ is_active: true });
  expect(intent.current).toBeNull();
});

it('requires every member stop confirmation for an unassigned legacy group', async () => {
  state.ownerId = null;
  await expect(activateReadwiseWithHandoff()).resolves.toMatchObject({ is_active: true });
  expect(writes.owner).toHaveBeenCalledTimes(1);
  expect(stopOrder).toEqual(['local', 'remote']);
  expect(writes.resume).toHaveBeenCalledTimes(1);
});

it('does not let a relinquished old owner reclaim itself while its ACK is usable', async () => {
  state.ownerId = state.localId;
  state.blockedReason = 'handoff-in-progress';
  await expect(activateReadwiseWithHandoff()).rejects.toThrow('readwise_handoff_in_progress');
  expect(writes.owner).not.toHaveBeenCalled();
});

it('can finish a local guard repair after a crash between self-stop and activation', async () => {
  state.ownerId = state.localId;
  state.blockedReason = 'handoff-in-progress';
  state.guard = { epoch: 0, groupId: 'group', mode: 'api', ownerId: state.localId,
    state: 'relinquished', targetId: state.localId };
  await expect(activateReadwiseWithHandoff()).resolves.toMatchObject({ is_active: true });
  expect(writes.guard).toHaveBeenCalledWith(expect.objectContaining({
    epoch: 1, ownerId: state.localId, state: 'active'
  }));
});

it('finishes a prepared activation after a crash without asking the old owner to stop again', async () => {
  state.guard = { epoch: 1, groupId: 'group', mode: 'api', ownerId: 'new-device',
    state: 'active', targetId: null };
  await expect(activateReadwiseWithHandoff()).resolves.toMatchObject({ is_active: true });
  expect(writes.owner).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});
