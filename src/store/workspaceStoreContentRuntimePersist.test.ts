import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createUpdateNodeContentMetrics } from './workspaceNodeContentUpdateDiagnostics';
import { resetNodeContentVersionGuardForTests } from './workspaceNodeContentVersionGuard';
import {
  markNodeContentEdited,
  markNodeCreatePending,
  shouldKeepLocalNodeContent
} from './workspaceNodeContentVersionGuard';
import { hasWorkspaceNodeMutationRuntime, syncNodeContentWithAnchorsMutationToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import {
  completeNodeCreateRuntimePersist,
  drainPendingNodeContentRuntimePersists,
  resetPendingNodeContentRuntimePersistsForTests,
  scheduleNodeContentRuntimePersist
} from './workspaceStoreContentRuntimePersist';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => true),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => ({ nodes: [] }))
}));

type WorkspaceNode = WorkspaceState['nodesById'][string];

function createNode(id: string, content: string): WorkspaceNode {
  return {
    anchorLink: null,
    content,
    createdAt: '2026-06-27T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    isTitleManual: false,
    kind: 'topic',
    parentNodeId: null,
    reveal: null,
    review: null,
    title: 'Node',
    updatedAt: '2026-06-27T00:00:00.000Z'
  };
}

function schedulePersist(node: WorkspaceNode, version = markNodeContentEdited(node.id)) {
  scheduleNodeContentRuntimePersist({
    contentLength: node.content.length,
    diagnosticsEnabled: false,
    localState: {
      localPatch: null,
      locatorUpdatedNodesForSync: [],
      nextNodeForSync: node,
      nodeOrderForSync: [node.id]
    },
    metrics: createUpdateNodeContentMetrics(false),
    nextNodeForSync: node,
    version
  });
  return version;
}

describe('workspaceStoreContentRuntimePersist queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNodeContentVersionGuardForTests();
    resetPendingNodeContentRuntimePersistsForTests();
    vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
    vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockResolvedValue({ nodes: [] });
  });

  afterEach(() => {
    resetPendingNodeContentRuntimePersistsForTests();
    resetNodeContentVersionGuardForTests();
  });

  it('drains only the latest pending content per node', async () => {
    schedulePersist(createNode('node-1', 'First draft'));
    schedulePersist(createNode('node-1', 'Latest draft'));

    await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(true);

    expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Latest draft', id: 'node-1' }),
      [],
      ['node-1']
    );
  });

  it('keeps create-pending nodes queued and reports a blocked drain', async () => {
    markNodeCreatePending('node-1');
    schedulePersist(createNode('node-1', 'Typed before create confirmation'));

    await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(false);
    expect(syncNodeContentWithAnchorsMutationToRuntime).not.toHaveBeenCalled();

    await expect(completeNodeCreateRuntimePersist('node-1')).resolves.toBe(true);
    expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Typed before create confirmation', id: 'node-1' }),
      [],
      ['node-1']
    );
  });

  it('returns false when a runtime mutation rejects the pending content', async () => {
    vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockResolvedValueOnce(null);
    schedulePersist(createNode('node-1', 'Rejected draft'));

    await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(false);
  });

  it('marks the drained version persisted only after runtime accepts it', async () => {
    const node = createNode('node-1', 'Accepted draft');
    const version = markNodeContentEdited(node.id);
    schedulePersist(node, version);

    expect(shouldKeepLocalNodeContent({
      currentUpdatedAt: '2026-06-27T00:00:00.000Z',
      incomingUpdatedAt: '2026-06-27T00:00:01.000Z',
      nodeId: node.id
    })).toBe(true);

    await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(true);

    expect(shouldKeepLocalNodeContent({
      currentUpdatedAt: '2026-06-27T00:00:00.000Z',
      incomingUpdatedAt: '2026-06-27T00:00:01.000Z',
      nodeId: node.id
    })).toBe(false);
  });
});
