import type { NodeKind } from '../../../lib/core/nodes/nodeKind';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeError } from './runtimeLogging';
import { loadWorkspaceNodeDocumentFromRuntime } from './workspaceRuntimeDocumentRepository';
import {
  listPendingNodeSyncSnapshots,
  resolvePendingNodeSync,
  stagePendingNodeSync
} from './workspacePendingNodeSync';
import type {
  WorkspaceRuntimeNode,
  WorkspaceRuntimeNodeDocument,
  WorkspaceRuntimeNodeSnapshot
} from './workspaceRuntimeTypes';

function resolveCreateWorkspaceNodeCommand(kind: NodeKind) {
  if (kind === 'folder') {
    return NATIVE_COMMANDS.createFolder;
  }
  if (kind === 'topic') {
    return NATIVE_COMMANDS.createTopic;
  }
  if (kind === 'item') {
    return NATIVE_COMMANDS.createItem;
  }
  return null;
}

export function createWorkspaceRuntimeNodeSnapshot(
  node: WorkspaceRuntimeNode,
  position?: number | null
): WorkspaceRuntimeNodeSnapshot {
  return {
    nodeId: node.id,
    parentNodeId: node.parentNodeId,
    kind: node.kind,
    priority: node.priority ?? null,
    desiredRetention: node.desiredRetention ?? null,
    title: node.title,
    isTitleManual: Boolean(node.isTitleManual),
    hideTitleHeading: Boolean(node.hideTitleHeading),
    content: node.content,
    virtualFilter: node.virtualFilter ?? null,
    reveal: node.reveal,
    anchorLink: node.anchorLink ?? null,
    imageRegions: node.imageRegions ?? null,
    reading: node.reading ?? null,
    position: typeof position === 'number' && position >= 0 ? position : null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt
  };
}

function toNodeAnchorLocatorUpdatePayload(node: WorkspaceRuntimeNode) {
  if (!node.anchorLink) {
    throw new Error(`missing anchor link for ${node.id}`);
  }
  return {
    nodeId: node.id,
    anchorLink: node.anchorLink,
    updatedAt: node.updatedAt
  };
}

function handleNodeSnapshotSyncResult(
  action: string,
  command:
    | typeof NATIVE_COMMANDS.createFolder
    | typeof NATIVE_COMMANDS.createTopic
    | typeof NATIVE_COMMANDS.createItem
    | typeof NATIVE_COMMANDS.updateNodeContent
    | typeof NATIVE_COMMANDS.updateNodeReveal,
  payload: WorkspaceRuntimeNodeSnapshot | null,
  runtimeInvoke: NonNullable<ReturnType<typeof getRuntimeInvoke>>,
  nodeId: string
) {
  if (!payload) {
    logRuntimeError('runtime sync failed', {
      area: 'native',
      action,
      command,
      fallback: 'skip_sync',
      error: new Error(`missing loaded document for ${nodeId}`)
    });
    return;
  }

  stagePendingNodeSync(payload);
  void runtimeInvoke(command, payload).then(
    () => resolvePendingNodeSync(payload.nodeId, payload.updatedAt),
    (error) => {
      logRuntimeError('runtime sync failed', {
        area: 'native',
        action,
        command,
        fallback: 'skip_sync',
        error
      });
    }
  );
}

function runNodeSnapshotSync(args: {
  action: string;
  command:
    | typeof NATIVE_COMMANDS.createFolder
    | typeof NATIVE_COMMANDS.createTopic
    | typeof NATIVE_COMMANDS.createItem
    | typeof NATIVE_COMMANDS.updateNodeContent
    | typeof NATIVE_COMMANDS.updateNodeReveal;
  isDocumentLoaded: (node: WorkspaceRuntimeNode) => boolean;
  mergeDocument: (node: WorkspaceRuntimeNode, document: WorkspaceRuntimeNodeDocument) => WorkspaceRuntimeNode;
  node: WorkspaceRuntimeNode;
  position?: number;
}) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    stagePendingNodeSync(createWorkspaceRuntimeNodeSnapshot(args.node, args.position));
    return;
  }
  if (args.isDocumentLoaded(args.node)) {
    handleNodeSnapshotSyncResult(
      args.action,
      args.command,
      createWorkspaceRuntimeNodeSnapshot(args.node, args.position),
      runtimeInvoke,
      args.node.id
    );
    return;
  }
  void loadWorkspaceNodeDocumentFromRuntime(args.node.id)
    .then((document) =>
      document ? createWorkspaceRuntimeNodeSnapshot(args.mergeDocument(args.node, document), args.position) : null
    )
    .catch(() => null)
    .then((payload) =>
      handleNodeSnapshotSyncResult(args.action, args.command, payload, runtimeInvoke, args.node.id)
    );
}

export function saveWorkspaceNodeContentSnapshot(args: {
  isDocumentLoaded: (node: WorkspaceRuntimeNode) => boolean;
  mergeDocument: (node: WorkspaceRuntimeNode, document: WorkspaceRuntimeNodeDocument) => WorkspaceRuntimeNode;
  node: WorkspaceRuntimeNode;
  position?: number;
}) {
  runNodeSnapshotSync({ ...args, action: 'sync_node_content', command: NATIVE_COMMANDS.updateNodeContent });
}

export function saveWorkspaceNodeContentSnapshotWithAnchors(args: {
  affectedAnchorNodes: WorkspaceRuntimeNode[];
  nodeOrder: string[];
  parentNode: WorkspaceRuntimeNode;
}) {
  const runtimeInvoke = getRuntimeInvoke();
  const parentPayload = createWorkspaceRuntimeNodeSnapshot(args.parentNode, args.nodeOrder.indexOf(args.parentNode.id));
  const anchorPayloads = args.affectedAnchorNodes.map(toNodeAnchorLocatorUpdatePayload);
  stagePendingNodeSync(parentPayload);
  if (!runtimeInvoke) {
    return;
  }

  void runtimeInvoke(NATIVE_COMMANDS.updateNodeContentWithAnchors, {
    parent: parentPayload,
    affectedAnchors: anchorPayloads
  }).then(
    () => resolvePendingNodeSync(parentPayload.nodeId, parentPayload.updatedAt),
    (error) => {
      logRuntimeError('runtime sync failed', {
        area: 'native',
        action: 'sync_node_content_with_anchors',
        command: NATIVE_COMMANDS.updateNodeContentWithAnchors,
        fallback: 'skip_sync',
        error
      });
    }
  );
}

export function saveCreatedWorkspaceNodeSnapshot(args: {
  isDocumentLoaded: (node: WorkspaceRuntimeNode) => boolean;
  mergeDocument: (node: WorkspaceRuntimeNode, document: WorkspaceRuntimeNodeDocument) => WorkspaceRuntimeNode;
  node: WorkspaceRuntimeNode;
  position?: number;
}) {
  const command = resolveCreateWorkspaceNodeCommand(args.node.kind) ?? NATIVE_COMMANDS.updateNodeContent;
  runNodeSnapshotSync({
    ...args,
    action: command === NATIVE_COMMANDS.updateNodeContent ? 'sync_create_node_fallback' : 'sync_create_node',
    command
  });
}

export function saveWorkspaceNodeRevealSnapshot(args: {
  isDocumentLoaded: (node: WorkspaceRuntimeNode) => boolean;
  mergeDocument: (node: WorkspaceRuntimeNode, document: WorkspaceRuntimeNodeDocument) => WorkspaceRuntimeNode;
  node: WorkspaceRuntimeNode;
  position?: number;
}) {
  runNodeSnapshotSync({ ...args, action: 'sync_node_reveal', command: NATIVE_COMMANDS.updateNodeReveal });
}

export async function replayPendingWorkspaceNodeSync(): Promise<void> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  for (const pendingNode of listPendingNodeSyncSnapshots()) {
    await runtimeInvoke(NATIVE_COMMANDS.updateNodeContent, pendingNode);
    resolvePendingNodeSync(pendingNode.nodeId, pendingNode.updatedAt);
  }
}
