import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeError } from './runtimeLogging';
import { resolvePendingNodeSync, stagePendingNodeSync } from './workspacePendingNodeSync';
import {
  capturePendingNodeOrderAck,
  resolveCapturedPendingNodeOrder
} from './workspaceRuntimeDurableRepository';
import {
  isCreateNodeMutationPatchResult,
  isNodeMutationPatchResult
} from './workspaceRuntimeMutationResults';
import { createWorkspaceRuntimeNodeSnapshot } from './workspaceRuntimeNodeRepository';
import type {
  WorkspaceNodeMutationPatchResult,
  WorkspaceRuntimeNode
} from './workspaceRuntimeTypes';

export type RuntimeNodeContentMutationDiagnostics = {
  invokeMs?: number;
  resultCheckMs?: number;
  snapshotMs?: number;
};

function readNowMs() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

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
  const payload = createWorkspaceRuntimeNodeSnapshot(args.node, args.position);
  if (!runtimeInvoke || !command) {
    stagePendingNodeSync(payload, { optimistic: true });
    return null;
  }
  const pendingOrderAck = capturePendingNodeOrderAck();
  stagePendingNodeSync(payload, { optimistic: true });
  try {
    const result = await runtimeInvoke(command, {
      ...payload,
      activeNodeId: args.activeNodeId ?? null,
      nodeOrder: args.nodeOrder
    });
    if (!isCreateNodeMutationPatchResult(result)) {
      return null;
    }
    resolvePendingNodeSync(payload.nodeId, payload.updatedAt);
    resolveCapturedPendingNodeOrder(pendingOrderAck);
    return result;
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

export async function savePdfImageExcerptNodeMutation(args: {
  activeNodeId: string;
  attachmentId: string;
  bytesBase64: string;
  node: WorkspaceRuntimeNode;
  nodeOrder: string[];
  position: number;
}): Promise<WorkspaceNodeMutationPatchResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  const payload = createWorkspaceRuntimeNodeSnapshot(args.node, args.position);
  const pendingOrderAck = capturePendingNodeOrderAck();
  stagePendingNodeSync(payload, { optimistic: true });
  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.createPdfImageExcerpt, {
      ...payload,
      activeNodeId: args.activeNodeId,
      attachmentId: args.attachmentId,
      bytesBase64: args.bytesBase64,
      nodeOrder: args.nodeOrder,
      originalName: `pdf-image-excerpt-page-${(payload.anchorLink?.locator as { page?: number } | undefined)?.page ?? 1}.png`
    });
    if (!isCreateNodeMutationPatchResult(result)) return null;
    resolvePendingNodeSync(payload.nodeId, payload.updatedAt);
    resolveCapturedPendingNodeOrder(pendingOrderAck);
    return result;
  } catch (error) {
    logRuntimeError('runtime sync failed', {
      area: 'native', action: 'create_pdf_image_excerpt', command: NATIVE_COMMANDS.createPdfImageExcerpt,
      fallback: 'none', error
    });
    return null;
  }
}

export async function saveWorkspaceNodeContentMutationWithAnchors(args: {
  affectedAnchorNodes: WorkspaceRuntimeNode[];
  diagnostics?: RuntimeNodeContentMutationDiagnostics;
  diagnosticsEnabled?: boolean;
  nodeOrder: string[];
  parentNode: WorkspaceRuntimeNode;
}): Promise<WorkspaceNodeMutationPatchResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const snapshotStartedAt = args.diagnostics ? readNowMs() : 0;
  const parent = createWorkspaceRuntimeNodeSnapshot(args.parentNode, args.nodeOrder.indexOf(args.parentNode.id));
  if (args.diagnostics) {
    args.diagnostics.snapshotMs = readNowMs() - snapshotStartedAt;
  }
  try {
    const invokeStartedAt = args.diagnostics ? readNowMs() : 0;
    const result = await runtimeInvoke(NATIVE_COMMANDS.updateNodeContentWithAnchors, {
      parent,
      affectedAnchors: args.affectedAnchorNodes.map(toNodeAnchorLocatorUpdatePayload),
      ...(args.diagnosticsEnabled ? { diagnostics: true } : {})
    });
    if (args.diagnostics) {
      args.diagnostics.invokeMs = readNowMs() - invokeStartedAt;
    }
    const resultCheckStartedAt = args.diagnostics ? readNowMs() : 0;
    const checkedResult = isNodeMutationPatchResult(result) ? result : null;
    if (args.diagnostics) {
      args.diagnostics.resultCheckMs = readNowMs() - resultCheckStartedAt;
    }
    return checkedResult;
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

type SaveSplitTopicWorkspaceMutationArgs = {
  activeNodeId: string;
  generatedNodes: WorkspaceRuntimeNode[];
  nodeOrder: string[];
  sourceNodeId: string;
  sourceParentNodeId: string | null;
} & ({ deletedAt: string; disposition: 'replace' } | { disposition: 'keep-as-parent' });

export async function saveSplitTopicWorkspaceMutation(args: SaveSplitTopicWorkspaceMutationArgs): Promise<WorkspaceNodeMutationPatchResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.splitTopic, {
      activeNodeId: args.activeNodeId,
      ...(args.disposition === 'replace' ? { deletedAt: args.deletedAt! } : {}),
      disposition: args.disposition,
      generatedNodes: args.generatedNodes.map((node) =>
        createWorkspaceRuntimeNodeSnapshot(node, args.nodeOrder.indexOf(node.id))
      ),
      nodeOrder: args.nodeOrder,
      sourceNodeId: args.sourceNodeId,
      sourceParentNodeId: args.sourceParentNodeId
    });
    return isNodeMutationPatchResult(result) ? result : null;
  } catch (error) {
    logRuntimeError('runtime sync failed', {
      area: 'native',
      action: 'split_topic',
      command: NATIVE_COMMANDS.splitTopic,
      fallback: 'none',
      error
    });
    return null;
  }
}
