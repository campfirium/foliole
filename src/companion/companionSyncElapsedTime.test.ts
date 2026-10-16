import { expect, it, vi } from 'vitest';

import { createSyncState, resetCompanionWorkspaceSyncFlowMocks,
  syncPlatformMock } from './companionWorkspaceSyncFlow.testHarness';

it('includes discovery in elapsed time without adding it to the database stage', async () => {
  resetCompanionWorkspaceSyncFlowMocks();
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-10-16T00:00:00Z'));
    syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints.mockImplementation(async endpointUrl => {
      vi.setSystemTime(new Date('2026-10-16T00:00:05Z'));
      return [{ endpointUrl }];
    });
    const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');
    expect(await tryForegroundAutoSync({ cancelled: () => false, state: createSyncState(),
      setError: vi.fn(), setState: vi.fn(), setStatus: vi.fn(), setSyncProgress: vi.fn()
    })).toBe('completed');
    expect(syncPlatformMock.recordCompanionWorkspaceSyncEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'run_finished', startedAt: '2026-10-16T00:00:00.000Z',
      summary: expect.objectContaining({ duration_ms: 5000 })
    }));
  } finally { vi.useRealTimers(); }
});
