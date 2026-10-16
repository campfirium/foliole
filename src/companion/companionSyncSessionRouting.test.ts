import { beforeEach, expect, it, vi } from 'vitest';

import { createSyncObjectsResult, createSyncState, memberStateMock, resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock, syncPlatformMock } from './companionWorkspaceSyncFlow.testHarness';

const sessions = vi.hoisted(() => ({ ensure: vi.fn(), invalidate: vi.fn(), complete: vi.fn() }));
vi.mock('../shared/platform/companion/network/companionDesktopSession.js', () => ({
  ensureCompanionDesktopSession: sessions.ensure,
  invalidateCompanionDesktopSession: sessions.invalidate,
  captureCompanionDesktopRound: () => sessions.complete,
  waitForCompanionDesktopChanges: vi.fn()
}));


const desktop = { deviceId: 'mac', endpointUrl: 'http://mac:38641', platform: 'darwin',
  groupId: 'group', protocolVersion: 26 };
const phone = { deviceId: 'phone', endpointUrl: 'http://phone:38641', platform: 'ios-capacitor',
  groupId: 'group', protocolVersion: 26 };
const args = () => ({ cancelled: () => false, setError: vi.fn(), setState: vi.fn(),
  setSyncProgress: vi.fn(), setStatus: vi.fn(), state: createSyncState() });

let tryForegroundAutoSync: typeof import('./companionWorkspaceSyncFlow').tryForegroundAutoSync;

beforeEach(async () => {
  ({ tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow'));
  resetCompanionWorkspaceSyncFlowMocks();
  syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockResolvedValue([desktop]);
  memberStateMock.exchangeCompanionSyncGroupMemberState.mockImplementation(async () => ({
    localExited: false, peerRemoved: false, normalSyncReady: true, peerLibraryEpoch: 'epoch'
  }));
});

it('finishes the desktop data pass before independently discovering mobile peers', async () => {
  const order: string[] = [];
  syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints
    .mockImplementationOnce(async () => [desktop])
    .mockImplementationOnce(async () => { order.push('mobile-discovery'); return [phone]; });
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementation(async endpoint => {
    order.push(endpoint);
    return createSyncObjectsResult();
  });
  const input = { ...args(), discoverMobilePeers: true };
  const result = await tryForegroundAutoSync(input);
  expect(input.setError.mock.calls.filter(([error]) => error !== null)).toEqual([]);
  expect(result).toBe('completed');
  expect(order).toEqual([desktop.endpointUrl, 'mobile-discovery', phone.endpointUrl]);
  expect(sessions.ensure).toHaveBeenCalledOnce();
});

it('checks membership and epoch on each round while retaining a busy desktop session', async () => {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValue(new Error('sync_round_busy'));
  await expect(tryForegroundAutoSync(args())).resolves.toBe('pending');
  await expect(tryForegroundAutoSync(args())).resolves.toBe('pending');
  expect(memberStateMock.exchangeCompanionSyncGroupMemberState).toHaveBeenCalledTimes(2);
  expect(sessions.ensure).toHaveBeenCalledWith(desktop.endpointUrl, desktop.deviceId,
    { target: desktop, libraryEpoch: 'epoch' });
  expect(sessions.invalidate).not.toHaveBeenCalled();
});

it('does not discard the desktop session because attachments need another attempt', async () => {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult({
    databaseConfirmedAt: '2026-10-16T01:00:00Z', attachmentResourceError: 'unavailable'
  }));
  await tryForegroundAutoSync(args());
  expect(sessions.invalidate).not.toHaveBeenCalled();
});

it('invalidates an unreachable member-state endpoint before the next recovery discovery', async () => {
  memberStateMock.exchangeCompanionSyncGroupMemberState.mockRejectedValue(new Error('ECONNREFUSED'));
  await expect(tryForegroundAutoSync(args())).resolves.toBe('failed');
  expect(sessions.invalidate).toHaveBeenCalledWith(desktop.endpointUrl);
  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).not.toHaveBeenCalled();
});

it('invalidates revoked membership without transferring data', async () => {
  memberStateMock.exchangeCompanionSyncGroupMemberState.mockResolvedValue({ localExited: false, peerRemoved: true });
  await expect(tryForegroundAutoSync(args())).resolves.toBe('skipped');
  expect(sessions.invalidate).toHaveBeenCalledWith(desktop.endpointUrl);
  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).not.toHaveBeenCalled();
});
