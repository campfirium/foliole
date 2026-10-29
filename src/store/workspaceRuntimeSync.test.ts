import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeWorkspaceNodeSnapshot } from '../../lib/platform/nativeStorageContract';
import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { readPendingNodeOrder, stagePendingNodeOrder } from '../shared/platform/workspacePendingDurableMutations';
import { workspaceMoveReceipt } from '../test/workspaceMoveReceipt';

import { mergePendingNodeSyncIntoSnapshot } from './workspacePendingNodeSync';
import {
  syncCreateNodeToRuntime,
  syncMoveNodesToRuntime,
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
    shelvedAt: null,
    manualChildOrder: null,
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
    imageSources: null,
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
    reading: null,
    review: node.review ?? null
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
    shelvedAt: null,
    manualChildOrder: null,
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
    imageSources: null,
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

it('syncs only the move scope without acknowledging a different pending global order', async () => {
    const payload = {
      parentOrders: [{ parentNodeId: null, expectedChildIds: ['node-1', 'node-2'], childIds: ['node-2'] },
        { parentNodeId: 'node-2', expectedChildIds: [], childIds: ['node-1'] }],
      nodes: [{ nodeId: 'node-1', expectedParentNodeId: null, parentNodeId: 'node-2',
        updatedAt: '2026-03-06T00:00:01.000Z' }],
      maintainSequentialReading: true, defaultPriority: 5 as const
    };
    const receipt = workspaceMoveReceipt(payload);
    const invoke = vi.fn().mockResolvedValue(receipt);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    stagePendingNodeOrder(['node-1', 'node-2']);
    const pending = readPendingNodeOrder();
    await expect(syncMoveNodesToRuntime(payload)).resolves.toEqual(receipt);
    expect(readPendingNodeOrder()).toEqual(pending);
    expect(invoke).toHaveBeenCalledWith('move_nodes', payload);
    expectNoWorkspacePersist(invoke);
});


it.each([
  { movedNodeIds: ['node-1'], nodeOrder: ['node-1'] },
  { movedNodeIds: ['node-1'], parentOrders: [], nodes: [], readings: [{ nodeId: 'node-1', reading: { state: 'active' } }] },
  { movedNodeIds: ['node-1'], parentOrders: [{ parentNodeId: null, childIds: [12] }], nodes: [], readings: [] }
])('rejects incomplete or malformed move receipts without acknowledging a pending order', async (receipt) => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockResolvedValue(receipt));
  stagePendingNodeOrder(['node-1']);
  const pending = readPendingNodeOrder();
  await expect(syncMoveNodesToRuntime({ nodes: [], parentOrders: [], maintainSequentialReading: false,
    defaultPriority: 5 })).resolves.toBeUndefined();
  expect(readPendingNodeOrder()).toEqual(pending);
});
