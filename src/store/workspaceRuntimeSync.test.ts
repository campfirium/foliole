import { describe, expect, it, vi } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/bridge';

import {
  syncDeleteNodesPermanentlyToRuntime,
  syncNodeContentToRuntime,
  syncNodeOrderToRuntime,
  syncNodeRevealToRuntime,
  syncReadingProgressToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime,
  syncReviewGradeToRuntime,
  syncReviewGradeToRuntimeWithRetry
} from './workspaceRuntimeSync';

vi.mock('../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

function createNodeFixture(): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    title: 'Seed',
    isTitleManual: false,
    content: '# Seed',
    anchorLink: { id: 'hl-1', kind: 'highlight' },
    reveal: 'Reveal',
    review: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:01.000Z'
  };
}

const REVIEW_GRADE_PAYLOAD = {
  nodeId: 'node-qa',
  grade: 3 as const,
  reviewedAt: '2026-03-06T00:00:00.000Z',
  cardBefore: {
    due: '2026-03-06T00:00:00.000Z',
    last_review: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  },
  cardAfter: {
    due: '2026-03-09T00:00:00.000Z',
    last_review: '2026-03-06T00:00:00.000Z',
    state: 1 as const,
    stability: 1.4,
    difficulty: 2.2,
    elapsed_days: 1,
    scheduled_days: 3,
    reps: 1,
    lapses: 0
  }
};

function expectNoWorkspacePersist(invoke: ReturnType<typeof vi.fn>) {
  const invokedCommands = invoke.mock.calls.map((call) => call[0]);
  expect(invokedCommands).not.toContain('save_workspace_state');
}

describe('workspaceRuntimeSync node mutations', () => {
  it('sends node content updates through update_node_content command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncNodeContentToRuntime(createNodeFixture());

    expect(invoke).toHaveBeenCalledWith('update_node_content', {
      nodeId: 'node-1',
      parentNodeId: null,
      title: 'Seed',
      isTitleManual: false,
      content: '# Seed',
      reveal: 'Reveal',
      anchorLink: { id: 'hl-1', kind: 'highlight' },
      position: null,
      createdAt: '2026-03-06T00:00:00.000Z',
      updatedAt: '2026-03-06T00:00:01.000Z'
    });
    expectNoWorkspacePersist(invoke);
  });

  it('skips sync when runtime invoke is unavailable', () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);

    expect(() => syncNodeContentToRuntime(createNodeFixture())).not.toThrow();
  });

  it('sends reveal updates through update_node_reveal command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncNodeRevealToRuntime(createNodeFixture());

    expect(invoke).toHaveBeenCalledWith('update_node_reveal', {
      nodeId: 'node-1',
      parentNodeId: null,
      title: 'Seed',
      isTitleManual: false,
      content: '# Seed',
      reveal: 'Reveal',
      anchorLink: { id: 'hl-1', kind: 'highlight' },
      position: null,
      createdAt: '2026-03-06T00:00:00.000Z',
      updatedAt: '2026-03-06T00:00:01.000Z'
    });
    expectNoWorkspacePersist(invoke);
  });

  it('syncs full node order through replace_node_order command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncNodeOrderToRuntime(['node-1', 'node-2']);

    expect(invoke).toHaveBeenCalledWith('replace_node_order', { nodeIds: ['node-1', 'node-2'] });
    expectNoWorkspacePersist(invoke);
  });
});

describe('workspaceRuntimeSync review mutations', () => {
  it('syncs review grade mutations through apply_review_grade command', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const synced = await syncReviewGradeToRuntime(REVIEW_GRADE_PAYLOAD);

    expect(synced).toBe(true);
    expect(invoke).toHaveBeenCalledWith('apply_review_grade', REVIEW_GRADE_PAYLOAD);
    expectNoWorkspacePersist(invoke);
  });

  it('returns false when runtime review mutation fails', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('failed'));
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const synced = await syncReviewGradeToRuntime(REVIEW_GRADE_PAYLOAD);

    expect(synced).toBe(false);
    expect(invoke).toHaveBeenCalledWith('apply_review_grade', REVIEW_GRADE_PAYLOAD);
  });

  it('retries review grade mutation in background queue until success', async () => {
    vi.useFakeTimers();
    try {
      const invoke = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(null);
      vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

      syncReviewGradeToRuntimeWithRetry(REVIEW_GRADE_PAYLOAD);
      await vi.advanceTimersByTimeAsync(0);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenNthCalledWith(1, 'apply_review_grade', REVIEW_GRADE_PAYLOAD);

      await vi.advanceTimersByTimeAsync(1500);

      expect(invoke).toHaveBeenCalledTimes(2);
      expect(invoke).toHaveBeenNthCalledWith(2, 'apply_review_grade', REVIEW_GRADE_PAYLOAD);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('workspaceRuntimeSync trash mutations', () => {
  it('syncs soft delete mutations through soft_delete_nodes command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncSoftDeleteNodesToRuntime({
      nodeIds: ['node-1', 'node-2'],
      deletedAt: '2026-03-06T00:00:00.000Z'
    });

    expect(invoke).toHaveBeenCalledWith('soft_delete_nodes', {
      nodeIds: ['node-1', 'node-2'],
      deletedAt: '2026-03-06T00:00:00.000Z'
    });
    expectNoWorkspacePersist(invoke);
  });

  it('syncs restore mutations through restore_nodes command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncRestoreNodesToRuntime({ nodeIds: ['node-1'] });

    expect(invoke).toHaveBeenCalledWith('restore_nodes', { nodeIds: ['node-1'] });
    expectNoWorkspacePersist(invoke);
  });

  it('syncs permanent delete mutations through delete_nodes_permanently command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncDeleteNodesPermanentlyToRuntime({
      nodeIds: ['node-3'],
      nodeOrder: ['node-1', 'node-2']
    });

    expect(invoke).toHaveBeenCalledWith('delete_nodes_permanently', {
      nodeIds: ['node-3'],
      nodeOrder: ['node-1', 'node-2']
    });
    expectNoWorkspacePersist(invoke);
  });
});

describe('workspaceRuntimeSync reading progress', () => {
  it('syncs reading progress through save_reading_progress command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncReadingProgressToRuntime({
      activeNodeId: 'node-2',
      nodeViewStates: [
        {
          nodeId: 'node-2',
          scrollTop: 120,
          selectionFrom: 4,
          selectionTo: 8
        }
      ],
      updatedAt: '2026-03-06T00:00:00.000Z'
    });

    expect(invoke).toHaveBeenCalledWith('save_reading_progress', {
      activeNodeId: 'node-2',
      nodeViewStates: [
        {
          nodeId: 'node-2',
          scrollTop: 120,
          selectionFrom: 4,
          selectionTo: 8
        }
      ],
      updatedAt: '2026-03-06T00:00:00.000Z'
    });
    expectNoWorkspacePersist(invoke);
  });
});
