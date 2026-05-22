import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import { listPendingNodeSyncSnapshots, resolvePendingNodeSync } from './workspacePendingNodeSync';
import type { WorkspaceRuntimeNodeSnapshot, WorkspaceRuntimeSnapshot } from './workspaceRuntimeTypes';

function hasReplayableParent(pendingNode: WorkspaceRuntimeNodeSnapshot, knownNodeIds: Set<string>) {
  return !pendingNode.parentNodeId || knownNodeIds.has(pendingNode.parentNodeId);
}

function toRuntimeNodeIdSet(snapshot: WorkspaceRuntimeSnapshot) {
  return new Set(Object.keys(snapshot.nodesById));
}

export async function replayPendingWorkspaceNodeSync(): Promise<void> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  const knownNodeIds = toRuntimeNodeIdSet(await runtimeInvoke(NATIVE_COMMANDS.loadWorkspaceListSnapshot, undefined));
  let pendingNodes = listPendingNodeSyncSnapshots();
  while (pendingNodes.length > 0) {
    const blockedNodes: WorkspaceRuntimeNodeSnapshot[] = [];
    let replayedCount = 0;
    for (const pendingNode of pendingNodes) {
      if (!hasReplayableParent(pendingNode, knownNodeIds)) {
        blockedNodes.push(pendingNode);
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
