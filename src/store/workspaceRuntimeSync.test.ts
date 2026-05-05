import { describe, expect, it, vi } from 'vitest';

import type { NativeWorkspaceNodeSnapshot } from '../../lib/platform/nativeStorageContract';
import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/bridge';
import { isDesktopRuntime } from '../shared/platform/runtime';

import { mergePendingNodeSyncIntoSnapshot } from './workspacePendingNodeSync';
import {
  syncNodeContentToRuntime,
  syncNodeOrderToRuntime,
  syncNodeRevealToRuntime,
  syncReviewGradeToRuntime
} from './workspaceRuntimeSync';

vi.mock('../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../shared/platform/runtime', () => ({
  isDesktopRuntime: vi.fn(() => false)
}));

function createNodeFixture(): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    priority: 0,
    desiredRetention: 0.81,
    title: 'Seed',
    isTitleManual: false,
    hideTitleHeading: true,
    content: '# Seed',
    anchorLink: { id: 'hl-1', kind: 'highlight' },
    reveal: 'Reveal',
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-03-06T00:00:00.000Z',
      nextAt: '2026-03-06T00:00:00.000Z',
      priority: 0,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'dismissed'
    },
    review: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:01.000Z'
  };
}

function createRuntimeSnapshotNodeFixture(): NativeWorkspaceNodeSnapshot {
  const node = createNodeFixture();
  return {
    ...node,
    isTitleManual: false,
    hideTitleHeading: true,
    anchorLink: node.anchorLink ?? null,
    reading: null
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

function expectNodeMutationSync(invoke: ReturnType<typeof vi.fn>, command: 'update_node_content' | 'update_node_reveal') {
  expect(invoke).toHaveBeenCalledWith(command, {
    nodeId: 'node-1',
    parentNodeId: null,
    priority: 0,
    desiredRetention: 0.81,
    title: 'Seed',
    isTitleManual: false,
    hideTitleHeading: true,
    content: '# Seed',
    reveal: 'Reveal',
    anchorLink: { id: 'hl-1', kind: 'highlight' },
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-03-06T00:00:00.000Z',
      nextAt: '2026-03-06T00:00:00.000Z',
      priority: 0,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'dismissed'
    },
    position: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:01.000Z'
  });
}

describe('workspaceRuntimeSync node mutations', () => {
  it('stages node content updates into pending storage until runtime ack clears them', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncNodeContentToRuntime(createNodeFixture());

    expect(mergePendingNodeSyncIntoSnapshot({
      activeNodeId: 'node-1',
      nodeOrder: ['node-1'],
      nodesById: {
        'node-1': createRuntimeSnapshotNodeFixture()
      },
      trashedNodeIds: []
    })?.nodesById['node-1']?.reading?.state).toBe('dismissed');

    await Promise.resolve();

    expect(mergePendingNodeSyncIntoSnapshot({
      activeNodeId: 'node-1',
      nodeOrder: ['node-1'],
      nodesById: {
        'node-1': createRuntimeSnapshotNodeFixture()
      },
      trashedNodeIds: []
    })?.nodesById['node-1']?.reading).toBeNull();
  });

  it('sends node content updates through update_node_content command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncNodeContentToRuntime(createNodeFixture());

    expectNodeMutationSync(invoke, 'update_node_content');
    expectNoWorkspacePersist(invoke);
  });

  it('sends reveal updates through update_node_reveal command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncNodeRevealToRuntime(createNodeFixture());

    expectNodeMutationSync(invoke, 'update_node_reveal');
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

describe('workspaceRuntimeSync node logging', () => {
  it('logs node order sync failures instead of swallowing them silently', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('database offline'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncNodeOrderToRuntime(['node-1', 'node-2']);
    await Promise.resolve();

    expect(error).toHaveBeenCalledWith(
      '[native] runtime sync failed',
      expect.objectContaining({
        area: 'native',
        action: 'sync_node_order',
        command: 'replace_node_order',
        fallback: 'skip_sync',
        error: { name: 'Error', message: 'database offline' }
      })
    );
  });
});

describe('workspaceRuntimeSync node runtime fallback', () => {
  it('skips sync when runtime invoke is unavailable', () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);

    expect(() => syncNodeContentToRuntime(createNodeFixture())).not.toThrow();
  });
});

describe('workspaceRuntimeSync review mutations', () => {
  it('syncs review grade mutations through apply_review_grade command', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    await expect(syncReviewGradeToRuntime(REVIEW_GRADE_PAYLOAD)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('apply_review_grade', REVIEW_GRADE_PAYLOAD);
    expectNoWorkspacePersist(invoke);
  });

  it('throws when runtime review mutation fails', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('failed'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    await expect(syncReviewGradeToRuntime(REVIEW_GRADE_PAYLOAD)).rejects.toThrow('failed');
    expect(invoke).toHaveBeenCalledWith('apply_review_grade', REVIEW_GRADE_PAYLOAD);
    expect(error).toHaveBeenCalledWith(
      '[native] runtime review grade sync failed',
      expect.objectContaining({
        area: 'native',
        action: 'sync_review_grade',
        command: 'apply_review_grade',
        fallback: 'throw',
        error: { name: 'Error', message: 'failed' }
      })
    );
  });

  it('throws when runtime bridge is unavailable', async () => {
    vi.mocked(isDesktopRuntime).mockReturnValue(true);
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);

    await expect(syncReviewGradeToRuntime(REVIEW_GRADE_PAYLOAD)).rejects.toThrow(
      'runtime bridge unavailable for review grade sync'
    );
  });

  it('skips runtime sync in non-desktop environment when bridge is unavailable', async () => {
    vi.mocked(isDesktopRuntime).mockReturnValue(false);
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);

    await expect(syncReviewGradeToRuntime(REVIEW_GRADE_PAYLOAD)).resolves.toBeUndefined();
  });
});
