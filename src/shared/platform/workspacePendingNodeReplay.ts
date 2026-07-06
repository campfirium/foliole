import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import {
  decidePendingNodeSyncReplay,
  listPendingNodeSyncSnapshots,
  resolvePendingNodeSync
} from './workspacePendingNodeSync';
import type {
  WorkspaceRuntimeNodeSnapshot,
  WorkspaceRuntimeSnapshot
} from './workspaceRuntimeTypes';

function hasReplayableParent(pendingNode: WorkspaceRuntimeNodeSnapshot, knownNodeIds: Set<string>) {
  return !pendingNode.parentNodeId || knownNodeIds.has(pendingNode.parentNodeId);
}

function toRuntimeNodeIdSet(snapshot: WorkspaceRuntimeSnapshot) {
  return new Set(Object.keys(snapshot.nodesById));
}

function toReplaySnapshot(snapshot: WorkspaceRuntimeSnapshot | null) {
  if (!snapshot) {
    return null;
  }
  return {
    ...snapshot,
    nodesById: { ...snapshot.nodesById }
  };
}

export async function replayPendingWorkspaceNodeSync(): Promise<void> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  const snapshot = toReplaySnapshot(
    await runtimeInvoke(NATIVE_COMMANDS.loadWorkspaceListSnapshot, undefined)
  );
  if (!snapshot) {
    return;
  }
  const knownNodeIds = toRuntimeNodeIdSet(snapshot);
  let pendingNodes = listPendingNodeSyncSnapshots();
  while (pendingNodes.length > 0) {
    const blockedNodes: WorkspaceRuntimeNodeSnapshot[] = [];
    let replayedCount = 0;
    for (const pendingNode of pendingNodes) {
      if (!hasReplayableParent(pendingNode, knownNodeIds)) {
        blockedNodes.push(pendingNode);
        continue;
      }
      const decision = decidePendingNodeSyncReplay(snapshot, pendingNode);
      if (decision === 'block') {
        blockedNodes.push(pendingNode);
        continue;
      }
      if (decision === 'resolve') {
        resolvePendingNodeSync(pendingNode.nodeId, pendingNode.updatedAt);
        replayedCount += 1;
        continue;
      }
      await runtimeInvoke(NATIVE_COMMANDS.updateNodeContent, pendingNode);
      resolvePendingNodeSync(pendingNode.nodeId, pendingNode.updatedAt);
      knownNodeIds.add(pendingNode.nodeId);
      replayedCount += 1;
    }
    if (blockedNodes.length === 0 || replayedCount === 0) {
      return;
    }
    pendingNodes = blockedNodes;
  }
}
