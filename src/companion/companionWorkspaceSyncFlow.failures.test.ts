import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSyncState,
  resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock,
  syncPlatformMock
} from './companionWorkspaceSyncFlow.testHarness';

const relay = vi.hoisted(() => ({
  load: vi.fn(async () => null as null | { id: string }),
  connected: vi.fn(() => false),
  sync: vi.fn(async (_binding, _stats, progress: { published: number }) => { progress.published = 1; })
}));

vi.mock('../shared/platform/companion/sync/companionWebDavRelayStore', () => ({ loadCompanionWebDavRelay: relay.load }));
vi.mock('../shared/platform/companion/sync/companionWebDavRelayRound', () => ({
  companionWebDavRelayLanConnected: relay.connected,
  runCompanionWebDavRelayRound: relay.sync
}));

async function testKeepsUnreachableDesktopQuiet() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValue(new Error('Desktop unreachable.'));
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  const setError = vi.fn();
  const setStatus = vi.fn();

  const outcome = await tryForegroundAutoSync({
    cancelled: () => false,
    setError,
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus,
    state: createSyncState()
  });

  expect(setError).toHaveBeenCalledWith('Desktop unreachable.');
  expect(setError).toHaveBeenCalledWith(null);
  expect(outcome).toBe('failed');
  expect(setStatus).toHaveBeenLastCalledWith('idle');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Desktop unreachable.',
    result: 'failed',
    status: 'failed',
    triggerReason: 'automatic'
  }));
}

async function testRecordsStructureApplyFailureCause() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValue(new Error(
    'Failed to apply companion desktop sync pack. ambiguous column name: hash'
  ));
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');

  const outcome = await tryForegroundAutoSync({
    cancelled: () => false,
    setError: vi.fn(),
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus: vi.fn(),
    state: createSyncState()
  });

  expect(outcome).toBe('failed');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Topic list sync failed: ambiguous column name: hash',
    result: 'failed',
    status: 'failed'
  }));
}

async function testRecordsNativeBridgeFailureCause() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValue({
    message: 'Desktop HTTP request failed. Cause: ConnectException: Failed to connect to /10.0.2.2:38641.'
  });
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');

  const outcome = await tryForegroundAutoSync({
    cancelled: () => false,
    setError: vi.fn(),
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus: vi.fn(),
    state: createSyncState()
  });

  expect(outcome).toBe('failed');
  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Desktop HTTP request failed. Cause: ConnectException: Failed to connect to /10.0.2.2:38641.',
    result: 'failed',
    status: 'failed'
  }));
}

async function testRecordsMissingFailureDetails() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValue({});
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');

  await tryForegroundAutoSync({
    cancelled: () => false,
    setError: vi.fn(),
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus: vi.fn(),
    state: createSyncState()
  });

  expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Desktop sync failed: no error details were returned.',
    result: 'failed',
    status: 'failed'
  }));
}

async function testSurfacesMissingAnchorBeforeSyncStarts() {
  syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints
    .mockRejectedValueOnce(new Error('discovery_no_devices'));
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  const setError = vi.fn();
  const setStatus = vi.fn();

  const outcome = await tryForegroundAutoSync({
    cancelled: () => false,
    setError,
    setState: vi.fn(),
    setSyncProgress: vi.fn(),
    setStatus,
    state: createSyncState()
  });

  expect(outcome).toBe('failed');
  expect(setError).toHaveBeenCalledWith('discovery_no_devices');
  expect(setStatus).toHaveBeenLastCalledWith('idle');
  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).not.toHaveBeenCalled();
}

describe('tryForegroundAutoSync failures', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);

  it('returns the public sync control to idle after a canceled run releases ownership', async () => {
    let cancelled = false;
    syncObjectsMock.syncCompanionObjectsFromDesktop.mockImplementationOnce(async () => {
      cancelled = true;
      throw new Error('sync_session_cancelled');
    });
    const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
    const setStatus = vi.fn();
    await tryForegroundAutoSync({ cancelled: () => cancelled, setError: vi.fn(), setState: vi.fn(),
      setSyncProgress: vi.fn(), setStatus, state: createSyncState() });
    expect(cancelled).toBe(true);
    expect(setStatus).toHaveBeenLastCalledWith('idle');
  });

  it('surfaces unreachable desktop as a foreground error prompt', testKeepsUnreachableDesktopQuiet);

  it('records structure apply failure causes in sync activity', testRecordsStructureApplyFailureCause);

  it('records native bridge failure causes in sync activity', testRecordsNativeBridgeFailureCause);

  it('records when a failed sync returns no error details', testRecordsMissingFailureDetails);

  it('uses the bound relay for manual sync after the LAN lookup cannot reach a desktop', async () => {
    relay.load.mockResolvedValueOnce({ id: 'bound-test-relay' });
    syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints
      .mockRejectedValueOnce(new Error('discovery_no_devices'));
    const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
    const setStatus = vi.fn();
    const outcome = await tryForegroundAutoSync({
      cancelled: () => false, setError: vi.fn(), setState: vi.fn(), setSyncProgress: vi.fn(),
      setStatus, state: createSyncState(), triggerReason: 'manual', runId: 'relay-run'
    });
    expect(outcome).toBe('completed');
    expect(relay.sync).toHaveBeenCalledOnce();
    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenLastCalledWith('idle');
    expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
      endpointUrl: null, runId: 'relay-run', result: 'completed', message: expect.stringContaining('"published":1')
    }));
  });

  it('surfaces a missing desktop anchor before sync starts', testSurfacesMissingAnchorBeforeSyncStarts);
});

describe('scheduled WebDAV sends', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);
  it('does not check LAN or DAV for a scheduled send without durable pending changes', async () => {
    const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
    await expect(tryForegroundAutoSync(scheduledSend())).resolves.toBe('skipped');
    expect(relay.load).toHaveBeenCalledWith(true);
    expect(syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints).not.toHaveBeenCalled();
    expect(relay.sync).not.toHaveBeenCalled();
  });

  it('keeps LAN first for a scheduled send when the desktop is reachable', async () => {
    relay.load.mockResolvedValueOnce({ id: 'bound-test-relay' });
    const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
    await expect(tryForegroundAutoSync(scheduledSend())).resolves.toBe('completed');
    expect(syncObjectsMock.syncCompanionObjectsFromDesktop).toHaveBeenCalledOnce();
    expect(relay.sync).not.toHaveBeenCalled();
  });

  it('publishes a scheduled send through DAV only after LAN discovery fails', async () => {
    relay.load.mockResolvedValueOnce({ id: 'bound-test-relay' }).mockResolvedValueOnce({ id: 'bound-test-relay' });
    syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockRejectedValueOnce(new Error('discovery_no_devices'));
    const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
    await expect(tryForegroundAutoSync(scheduledSend())).resolves.toBe('completed');
    expect(relay.sync).toHaveBeenCalledOnce();
    expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
      endpointUrl: null, triggerReason: 'automatic', result: 'completed'
    }));
  });
});

function scheduledSend() {
  return { cancelled: () => false, scheduledWebDav: true, triggerReason: 'automatic' as const,
    setError: vi.fn(), setState: vi.fn(), setSyncProgress: vi.fn(), setStatus: vi.fn(), state: createSyncState() };
}
