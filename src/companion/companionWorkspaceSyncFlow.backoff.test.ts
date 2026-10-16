import { beforeEach, expect, it, vi } from 'vitest';

import { createSyncObjectsResult, createSyncState, resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock, syncPlatformMock } from './companionWorkspaceSyncFlow.testHarness';

beforeEach(resetCompanionWorkspaceSyncFlowMocks);
async function sync() {
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  return tryForegroundAutoSync({ cancelled: () => false, setError: vi.fn(), setState: vi.fn(),
    setSyncProgress: vi.fn(), setStatus: vi.fn(), state: createSyncState() });
}

it.each([
  { madeDatabaseProgress: true, appliedObjectIds: ['received'], remainingStructureChangeCount: 2 },
  { madeDatabaseProgress: true, pushedObjectIds: ['sent'], localDirtyCount: 2 },
  { transferredAttachmentCount: 1, remainingAttachmentResourceCount: 2 }
])('continues actual progress quickly: %j', async result => {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult(result));
  expect(await sync()).toBe('backlog');
});

it.each([
  { remainingStructureChangeCount: 2 },
  { localDirtyCount: 2 },
  { pendingAckCount: 2 },
  { appliedObjectIds: ['unchanged'], remainingStructureChangeCount: 2 },
  { remainingAttachmentResourceCount: 2 }
])('backs off pending work without a transfer: %j', async result => {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult(result));
  expect(await sync()).toBe('pending');
});

it.each(['completed', 'progress'] as const)('does not hide a busy peer behind another peer: %s', async other => {
  syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockResolvedValue([
    { endpointUrl: 'http://busy:38641' }, { endpointUrl: 'http://available:38641' }
  ]);
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValueOnce(new Error('sync_round_busy'))
    .mockResolvedValueOnce(createSyncObjectsResult(other === 'progress'
      ? { madeDatabaseProgress: true, appliedObjectIds: ['received'], remainingStructureChangeCount: 1 } : {}));
  expect(await sync()).toBe('pending');
  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledTimes(2);
});

it.each(['sync_round_busy', 'sync_round_expired', 'sync_round_wait_expired', 'TimeoutError'])('retains the retryable cause: %s', async message => {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValueOnce(new Error(message));
  expect(await sync()).toBe('pending');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'run_finished', message: expect.stringContaining(message), status: 'skipped', result: 'partial'
  }));
});

it('retains nested network codes and timeout names in diagnostics', async () => {
  const timeout = new Error('The operation timed out.');
  timeout.name = 'TimeoutError';
  const connection = Object.assign(new Error('Connection failed.', { cause: timeout }), { code: 'ECONNRESET' });
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValueOnce(new Error('Request failed.', { cause: connection }));
  expect(await sync()).toBe('pending');
  const events = syncPlatformMock.recordCompanionWorkspaceSyncEvent.mock.calls.map(([event]) => event);
  expect(events).toContainEqual(expect.objectContaining({ kind: 'run_finished', message: expect.stringContaining('ECONNRESET') }));
  expect(events).toContainEqual(expect.objectContaining({ kind: 'run_finished', message: expect.stringContaining('TimeoutError') }));
});


it.each(['manual', 'automatic'] as const)('only waits for inbound ownership when triggered by %s', async triggerReason => {
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockResolvedValue(createSyncObjectsResult({}));
  await tryForegroundAutoSync({ cancelled: () => false, setError: vi.fn(), setState: vi.fn(),
    setSyncProgress: vi.fn(), setStatus: vi.fn(), state: createSyncState(), triggerReason });
  expect(syncObjectsMock.syncCompanionObjectsFromDesktop.mock.calls[0]?.[1].waitForInbound()).toBe(triggerReason === 'manual');
});


it('retains manual intent when a click joins an automatic round still preparing its peer', async () => {
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  const runtime = await import('../shared/platform/companionWorkspaceRuntimeRepository');
  let release!: () => void;
  let entered!: () => void;
  const preparing = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(runtime.beginNativeCompanionSyncRun).mockImplementationOnce(async () => {
    entered(); await gate;
    return { reason: 'automatic', run_id: 'preparing', runtime: 'android' };
  });
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementation(async (_endpoint, options) => {
    const waits = typeof options.waitForInbound === 'function' ? options.waitForInbound() : options.waitForInbound;
    if (!waits) throw new Error('sync_round_busy');
    return createSyncObjectsResult({});
  });
  const args = { cancelled: () => false, setError: vi.fn(), setState: vi.fn(),
    setSyncProgress: vi.fn(), setStatus: vi.fn(), state: createSyncState() };
  const automatic = tryForegroundAutoSync({ ...args, triggerReason: 'automatic' });
  await preparing;
  let joined!: () => void;
  const identified = new Promise<void>(resolve => { joined = resolve; });
  const manual = tryForegroundAutoSync({ ...args, triggerReason: 'manual',
    onRunIdentified: () => joined() });
  await identified;
  release();
  expect(await manual).toBe('completed');
  expect(await automatic).toBe('completed');
  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledOnce();
});
