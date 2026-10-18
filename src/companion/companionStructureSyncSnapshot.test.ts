import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceSyncMock = vi.hoisted(() => ({
  loadCompanionWorkspaceDisplayState: vi.fn()
}));

vi.mock('../shared/platform/companionWorkspaceSync', () => workspaceSyncMock);

describe('loadCompanionStateAfterStructureSyncReport', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('accepts an empty workspace after its last node is deleted', async () => {
    const { loadCompanionStateAfterStructureSyncReport } = await import('./companionStructureSyncSnapshot');
    workspaceSyncMock.loadCompanionWorkspaceDisplayState.mockResolvedValue({
      endpoint_url: null,
      last_synced_at: null,
      remembered_targets: [],
      sync_events: [],
      sync_onboarding_status: 'completed',
      workspace_snapshot: null
    });

    const report = await loadCompanionStateAfterStructureSyncReport();

    expect(report.fallbackReason).toBeNull();
    expect(report.state?.workspace_snapshot).toBeNull();
  });

  it('reports db_busy separately from generic snapshot refresh errors', async () => {
    const { loadCompanionStateAfterStructureSyncReport } = await import('./companionStructureSyncSnapshot');
    workspaceSyncMock.loadCompanionWorkspaceDisplayState.mockRejectedValue(new Error('SQLiteException: database is locked'));

    const report = await loadCompanionStateAfterStructureSyncReport();

    expect(report.fallbackReason).toBe('db_busy');
    expect(report.state).toBeNull();
  });

  it('reports timeout without treating it as a successful snapshot refresh', async () => {
    vi.useFakeTimers();
    try {
      const { loadCompanionStateAfterStructureSyncReport } = await import('./companionStructureSyncSnapshot');
      workspaceSyncMock.loadCompanionWorkspaceDisplayState.mockReturnValue(new Promise(() => undefined));

      const reportPromise = loadCompanionStateAfterStructureSyncReport();
      await vi.advanceTimersByTimeAsync(8_000);
      const report = await reportPromise;

      expect(report.fallbackReason).toBe('timeout');
      expect(report.state).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
