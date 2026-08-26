import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSyncState,
  resetCompanionWorkspaceSyncFlowMocks,
  syncObjectsMock,
  syncPlatformMock
} from './companionWorkspaceSyncFlow.testHarness';

async function testKeepsUnreachableDesktopQuiet() {
  syncObjectsMock.syncCompanionObjectsFromDesktop.mockRejectedValue(new Error('Desktop unreachable.'));
  const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
  const setError = vi.fn();
  const setStatus = vi.fn();

  const outcome = await tryForegroundAutoSync({
    cancelled: () => false,
    setError,
    setReadableArticle: vi.fn(),
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
    setReadableArticle: vi.fn(),
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
    setReadableArticle: vi.fn(),
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
    setReadableArticle: vi.fn(),
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

describe('tryForegroundAutoSync failures', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);

  it('surfaces unreachable desktop as a foreground error prompt', testKeepsUnreachableDesktopQuiet);

  it('records structure apply failure causes in sync activity', testRecordsStructureApplyFailureCause);

  it('records native bridge failure causes in sync activity', testRecordsNativeBridgeFailureCause);

  it('records when a failed sync returns no error details', testRecordsMissingFailureDetails);
});
