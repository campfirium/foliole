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
  groupId: 'group', protocolVersion: 27 };
const phone = { deviceId: 'phone', endpointUrl: 'http://phone:38641', platform: 'ios-capacitor',
  groupId: 'group', protocolVersion: 27 };
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

it.each(['onSessionReused', 'onDiscoveryShortened'] as const)('finishes desktop data before mobile discovery after %s', async trigger => {
  const order: string[] = [];
  syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints
    .mockImplementationOnce(async (_endpoint, options) => { options?.[trigger]?.(); return [desktop]; })
    .mockImplementationOnce(async () => { order.push('mobile-discovery'); return [phone]; });
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementation(async endpoint => {
    order.push(endpoint);
    return createSyncObjectsResult();
  });
  const input = { ...args(), discoverMobilePeers: true };
  const result = await tryForegroundAutoSync(input);
  expect(input.setError.mock.calls.filter(([error]) => error !== null)).toEqual([]);
  expect(result).toBe('completed');
  await vi.waitFor(() => expect(order).toEqual([desktop.endpointUrl, 'mobile-discovery', phone.endpointUrl]));
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

it('sends a new desktop edit while mobile discovery is still unresolved', async () => {
  let finishDiscovery!: (targets: typeof phone[]) => void;
  const discovery = new Promise<typeof phone[]>(resolve => { finishDiscovery = resolve; });
  syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints
    .mockImplementationOnce(async (_endpoint, options) => { options?.onSessionReused?.(); return [desktop]; })
    .mockImplementationOnce(() => discovery)
    .mockResolvedValue([desktop]);
  let firstOutcome: string | undefined;
  const first = tryForegroundAutoSync({ ...args(), discoverMobilePeers: true }).then(outcome => {
    firstOutcome = outcome;
    return outcome;
  });
  try {
    await vi.waitFor(() => expect(syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(firstOutcome).toBe('completed'), { timeout: 1000 });
    await expect(tryForegroundAutoSync(args())).resolves.toBe('completed');
    expect(syncObjectsMock.syncCompanionObjectsFromDesktop.mock.calls.map(([endpoint]) => endpoint))
      .toEqual([desktop.endpointUrl, desktop.endpointUrl]);
  } finally {
    finishDiscovery([]);
    await first;
  }
});

it('finishes the initial desktop foreground round while discovered mobile transfer is blocked', async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let mobileFinished = false;
  syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockResolvedValue([desktop, phone]);
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementation(async endpoint => {
    if (endpoint === phone.endpointUrl) {
      await blocked;
      mobileFinished = true;
    }
    return createSyncObjectsResult();
  });
  let outcome: string | undefined;
  const foreground = tryForegroundAutoSync({ ...args(), discoverMobilePeers: true })
    .then(result => { outcome = result; });
  try {
    await vi.waitFor(() => expect(outcome).toBe('completed'));
    await vi.waitFor(() => expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledTimes(2));
    expect(mobileFinished).toBe(false);
    expect(syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints).toHaveBeenCalledOnce();
    expect(syncObjectsMock.syncCompanionObjectsFromDesktop.mock.calls.map(([endpoint]) => endpoint))
      .toEqual([desktop.endpointUrl, phone.endpointUrl]);
  } finally {
    release();
    await foreground;
    await vi.waitFor(() => expect(mobileFinished).toBe(true));
  }
});

it('acknowledges committed data even when the attachment result remains partial', async () => {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementation(async (_endpoint, options) => {
    await options.onDatabaseConfirmed('2026-10-16T01:00:00Z');
    expect(sessions.complete).toHaveBeenCalledOnce();
    return createSyncObjectsResult({ databaseConfirmedAt: '2026-10-16T01:00:00Z',
      attachmentResourceError: 'unavailable' });
  });
  await tryForegroundAutoSync(args());
  expect(sessions.complete).toHaveBeenCalledOnce();
});

it('does not mistake an in-flight mobile transfer for a requested desktop round', async () => {
  let release!: () => void;
  let started!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints
    .mockResolvedValueOnce([phone]).mockResolvedValue([desktop]);
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementationOnce(async () => {
    started();
    await blocked;
    return createSyncObjectsResult();
  }).mockResolvedValue(createSyncObjectsResult());
  const mobile = tryForegroundAutoSync(args());
  await ready;
  const desktopRound = tryForegroundAutoSync(args());
  release();
  await Promise.all([mobile, desktopRound]);
  expect(syncObjectsMock.syncCompanionObjectsFromDesktop.mock.calls.map(([endpoint]) => endpoint))
    .toEqual([phone.endpointUrl, desktop.endpointUrl]);
});
