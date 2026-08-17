import type { Node, NodeReviewProfile } from '../features/nodes/model/nodeTypes';
import { saveNodeReviewStateToRuntime } from '../shared/platform/runtime/nodeReviewStateRuntimeRepository';

import { WorkspacePartialPersistenceError } from './workspacePersistenceFailure';
import { runtimeWorkspaceReviewPersistence } from './workspaceReviewPersistence';
import { hasWorkspaceNodeMutationRuntime, syncNodeContentToRuntimeNow } from './workspaceRuntimeSync';

export interface WorkspaceHistoryPersistenceAdapter {
  persistNodeSnapshots: (nodes: Node[]) => Promise<boolean>;
  persistReadingSnapshots: (nodes: Node[], updatedAt: string) => Promise<boolean>;
  persistReviewSnapshot: (nodeId: string, review: NodeReviewProfile, updatedAt: string) => Promise<boolean>;
  persistShelveSnapshots: (nodes: Node[], updatedAt: string) => Promise<boolean>;
}

async function persistNodeSnapshots(nodes: Node[]) {
  for (const [index, node] of nodes.entries()) {
    try {
      if (!(await syncNodeContentToRuntimeNow(node))) {
        if (index > 0) throw new WorkspacePartialPersistenceError();
        return false;
      }
    } catch (error) {
      if (index > 0 && !(error instanceof WorkspacePartialPersistenceError)) {
        throw new WorkspacePartialPersistenceError();
      }
      throw error;
    }
  }
  return true;
}

const runtimePersistence: WorkspaceHistoryPersistenceAdapter = {
  persistNodeSnapshots,
  persistReadingSnapshots: (nodes, updatedAt) =>
    runtimeWorkspaceReviewPersistence.persistReadingNodes(nodes, updatedAt),
  persistReviewSnapshot: (nodeId, review, updatedAt) =>
    saveNodeReviewStateToRuntime({ nodeId, review, updatedAt }),
  persistShelveSnapshots: async (nodes, updatedAt) => {
    const [rootNode, ...readingNodes] = nodes;
    if (!rootNode) return false;
    const rootPersisted = await syncNodeContentToRuntimeNow(rootNode);
    if (!rootPersisted) return false;
    try {
      const readingsPersisted = await runtimeWorkspaceReviewPersistence.persistReadingNodes(readingNodes, updatedAt);
      if (!readingsPersisted && readingNodes.length > 0) throw new WorkspacePartialPersistenceError();
      return readingsPersisted;
    } catch (error) {
      if (error instanceof WorkspacePartialPersistenceError) throw error;
      throw new WorkspacePartialPersistenceError();
    }
  }
};

const browserLocalPersistence: WorkspaceHistoryPersistenceAdapter = {
  persistNodeSnapshots: async () => true,
  persistReadingSnapshots: async () => true,
  persistReviewSnapshot: async () => true,
  persistShelveSnapshots: async () => true
};

let installedPersistence: WorkspaceHistoryPersistenceAdapter | null = null;

export function getWorkspaceHistoryPersistence() {
  return installedPersistence ?? (hasWorkspaceNodeMutationRuntime() ? runtimePersistence : browserLocalPersistence);
}

export function installWorkspaceHistoryPersistence(adapter: WorkspaceHistoryPersistenceAdapter) {
  installedPersistence = adapter;
}

export function resetWorkspaceHistoryPersistence() {
  installedPersistence = null;
}
