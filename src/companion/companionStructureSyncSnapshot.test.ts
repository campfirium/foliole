import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceSyncMock = vi.hoisted(() => ({
  loadCompanionWorkspaceSyncState: vi.fn()
}));

vi.mock('../shared/platform/companionWorkspaceSync', () => workspaceSyncMock);

const fallbackSnapshot = {
  activeNodeId: 'fallback-node',
  nodeOrder: ['fallback-node'],
  nodesById: {},
  trashedNodeIds: [],
  untitledSequenceByParent: {}
};

describe('loadCompanionStateAfterStructureSyncReport', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reports no_data when state loads without a workspace snapshot', async () => {
    const { loadCompanionStateAfterStructureSyncReport } = await import('./companionStructureSyncSnapshot');
    workspaceSyncMock.loadCompanionWorkspaceSyncState.mockResolvedValue({
      endpoint_url: null,
      last_synced_at: null,
      remembered_targets: [],
      sync_events: [],
      sync_onboarding_status: 'completed',
      workspace_snapshot: null
    });

    const report = await loadCompanionStateAfterStructureSyncReport(fallbackSnapshot);

    expect(report.fallbackReason).toBe('no_data');
    expect(report.state?.workspace_snapshot).toBe(fallbackSnapshot);
  });

  it('reports db_busy separately from generic snapshot refresh errors', async () => {
    const { loadCompanionStateAfterStructureSyncReport } = await import('./companionStructureSyncSnapshot');
    workspaceSyncMock.loadCompanionWorkspaceSyncState.mockRejectedValue(new Error('SQLiteException: database is locked'));

    const report = await loadCompanionStateAfterStructureSyncReport(fallbackSnapshot);

    expect(report.fallbackReason).toBe('db_busy');
    expect(report.state).toBeNull();
  });

  it('reports timeout without treating it as a successful snapshot refresh', async () => {
    vi.useFakeTimers();
    try {
      const { loadCompanionStateAfterStructureSyncReport } = await import('./companionStructureSyncSnapshot');
      workspaceSyncMock.loadCompanionWorkspaceSyncState.mockReturnValue(new Promise(() => undefined));

      const reportPromise = loadCompanionStateAfterStructureSyncReport(fallbackSnapshot);
      await vi.advanceTimersByTimeAsync(8_000);
      const report = await reportPromise;

      expect(report.fallbackReason).toBe('timeout');
      expect(report.state).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
