import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createUpdateNodeContentMetrics } from './workspaceNodeContentUpdateDiagnostics';
import { resetNodeContentVersionGuardForTests } from './workspaceNodeContentVersionGuard';
import {
  markNodeContentEdited,
  markNodeCreateConfirmed,
  markNodeCreatePending,
  shouldKeepLocalNodeContent
} from './workspaceNodeContentVersionGuard';
import {
  readCachedWorkspaceNodeDocument,
  resetWorkspaceNodeDocumentCacheForTest
} from './workspaceNodeDocumentCache';
import { hasWorkspaceNodeMutationRuntime, syncNodeContentWithAnchorsMutationToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import {
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

beforeEach(() => {
  vi.clearAllMocks();
  resetNodeContentVersionGuardForTests();
  resetPendingNodeContentRuntimePersistsForTests();
  resetWorkspaceNodeDocumentCacheForTest();
  vi.mocked(hasWorkspaceNodeMutationRuntime).mockReturnValue(true);
  vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockResolvedValue({ nodes: [] });
});

afterEach(() => {
  resetPendingNodeContentRuntimePersistsForTests();
  resetNodeContentVersionGuardForTests();
  resetWorkspaceNodeDocumentCacheForTest();
});

describe('workspaceStoreContentRuntimePersist queue', () => {
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

  it('waits for create-pending nodes before draining queued content', async () => {
    markNodeCreatePending('node-1');
    schedulePersist(createNode('node-1', 'Typed before create confirmation'));

    const drainPromise = drainPendingNodeContentRuntimePersists();
    await Promise.resolve();
    expect(syncNodeContentWithAnchorsMutationToRuntime).not.toHaveBeenCalled();

    markNodeCreateConfirmed('node-1');
    await expect(drainPromise).resolves.toBe(true);
    expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Typed before create confirmation', id: 'node-1' }),
      [],
      ['node-1']
    );
    expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledTimes(1);
  });

  it('returns false when a runtime mutation rejects the pending content', async () => {
    vi.mocked(syncNodeContentWithAnchorsMutationToRuntime).mockResolvedValueOnce(null);
    schedulePersist(createNode('node-1', 'Rejected draft'));

    await expect(drainPendingNodeContentRuntimePersists()).resolves.toBe(false);
  });
});

describe('workspaceStoreContentRuntimePersist document cache', () => {
  it('updates the document cache when content is queued for delayed runtime persist', () => {
    schedulePersist(createNode('node-1', 'Cached delayed draft'));

    expect(readCachedWorkspaceNodeDocument('node-1')?.content).toBe('Cached delayed draft');
  });
});

describe('workspaceStoreContentRuntimePersist version guard', () => {
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
