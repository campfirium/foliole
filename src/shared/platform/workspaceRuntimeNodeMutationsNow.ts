import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeError } from './runtimeLogging';
import {
  isCreateNodeMutationPatchResult,
  isNodeMutationPatchResult
} from './workspaceRuntimeMutationResults';
import { createWorkspaceRuntimeNodeSnapshot } from './workspaceRuntimeNodeRepository';
import type {
  WorkspaceNodeMutationPatchResult,
  WorkspaceRuntimeNode
} from './workspaceRuntimeTypes';

function resolveCreateWorkspaceNodeCommand(kind: WorkspaceRuntimeNode['kind']) {
  if (kind === 'folder') return NATIVE_COMMANDS.createFolder;
  if (kind === 'topic') return NATIVE_COMMANDS.createTopic;
  if (kind === 'item') return NATIVE_COMMANDS.createItem;
  return null;
}

function toNodeAnchorLocatorUpdatePayload(node: WorkspaceRuntimeNode) {
  if (!node.anchorLink) {
    throw new Error(`missing anchor link for ${node.id}`);
  }
  return {
    nodeId: node.id,
    anchorLink: node.anchorLink,
    imageRegions: node.imageRegions ?? null,
    updatedAt: node.updatedAt
  };
}

export async function saveCreatedWorkspaceNodeMutationSnapshot(args: {
  activeNodeId?: string | null;
  node: WorkspaceRuntimeNode;
  nodeOrder: string[];
  position?: number;
}): Promise<WorkspaceNodeMutationPatchResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  const command = resolveCreateWorkspaceNodeCommand(args.node.kind);
  if (!runtimeInvoke || !command) {
    return null;
  }
  try {
    const result = await runtimeInvoke(command, {
      ...createWorkspaceRuntimeNodeSnapshot(args.node, args.position),
      activeNodeId: args.activeNodeId ?? null,
      nodeOrder: args.nodeOrder
    });
    return isCreateNodeMutationPatchResult(result) ? result : null;
  } catch (error) {
    logRuntimeError('runtime sync failed', {
      area: 'native',
      action: 'sync_create_node_mutation',
      command,
      fallback: 'none',
      error
    });
    return null;
  }
}

export async function saveWorkspaceNodeContentMutationWithAnchors(args: {
  affectedAnchorNodes: WorkspaceRuntimeNode[];
  nodeOrder: string[];
  parentNode: WorkspaceRuntimeNode;
}): Promise<WorkspaceNodeMutationPatchResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const parent = createWorkspaceRuntimeNodeSnapshot(args.parentNode, args.nodeOrder.indexOf(args.parentNode.id));
  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.updateNodeContentWithAnchors, {
      parent,
      affectedAnchors: args.affectedAnchorNodes.map(toNodeAnchorLocatorUpdatePayload)
    });
    return isNodeMutationPatchResult(result) ? result : null;
  } catch (error) {
    logRuntimeError('runtime sync failed', {
      area: 'native',
      action: 'sync_node_content_with_anchors_mutation',
      command: NATIVE_COMMANDS.updateNodeContentWithAnchors,
      fallback: 'none',
      error
    });
    return null;
  }
}
