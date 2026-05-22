import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeWorkspaceNodeSnapshot } from '../../lib/platform/nativeStorageContract';
import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { mergePendingNodeSyncIntoSnapshot } from './workspacePendingNodeSync';
import {
  syncCreateNodeToRuntime,
  syncNodeContentToRuntime,
  syncNodeOrderToRuntime,
  syncNodeRevealToRuntime
} from './workspaceRuntimeSync';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../shared/platform/runtime', () => ({
  isDesktopRuntime: vi.fn(() => false)
}));

function createNodeFixture(): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    priority: 0,
    desiredRetention: 0.81,
    enableShortTerm: null,
    sequentialReadingEnabled: null,
    title: 'Seed',
    isTitleManual: false,
    hideTitleHeading: true,
    content: '# Seed',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 2,
        to: 6,
        originalText: 'Seed'
      }
    },
    imageRegions: null,
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
    imageRegions: node.imageRegions ?? null,
    reading: null
  };
}

function expectNoWorkspacePersist(invoke: ReturnType<typeof vi.fn>) {
  const invokedCommands = invoke.mock.calls.map((call) => call[0]);
  expect(invokedCommands).not.toContain('save_workspace_state');
}

function expectNodeMutationSync(invoke: ReturnType<typeof vi.fn>, command: 'update_node_content' | 'update_node_reveal') {
  expect(invoke).toHaveBeenCalledWith(command, {
    nodeId: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    priority: 0,
    desiredRetention: 0.81,
    enableShortTerm: null,
    sequentialReadingEnabled: null,
    title: 'Seed',
    isTitleManual: false,
    hideTitleHeading: true,
    content: '# Seed',
    virtualFilter: null,
    reveal: 'Reveal',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 2,
        to: 6,
        originalText: 'Seed'
      }
    },
    imageRegions: null,
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
    position: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:01.000Z'
  });
}

describe('workspaceRuntimeSync node mutations', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.mocked(getRuntimeInvoke).mockReset();
  });

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

  it('sends created nodes through kind-specific create command', () => {
    const invoke = vi.fn().mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    syncCreateNodeToRuntime(createNodeFixture());

    expect(invoke).toHaveBeenCalledWith('create_topic', expect.objectContaining({ kind: 'topic' }));
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
