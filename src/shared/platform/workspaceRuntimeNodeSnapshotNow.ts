import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeCommandName } from '../../../lib/platform/nativeContract';

import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeError } from './runtimeLogging';
import { loadWorkspaceNodeDocumentFromRuntime } from './workspaceRuntimeDocumentRepository';
import { isNodeMutationPatchResult } from './workspaceRuntimeMutationResults';
import {
  createWorkspaceRuntimeNodeSnapshot
} from './workspaceRuntimeNodeRepository';
import type {
  WorkspaceNodeMutationPatchResult,
  WorkspaceRuntimeNode,
  WorkspaceRuntimeNodeDocument,
  WorkspaceRuntimeNodeSnapshot
} from './workspaceRuntimeTypes';

async function createLoadedNodeSnapshot(args: {
  isDocumentLoaded: (node: WorkspaceRuntimeNode) => boolean;
  mergeDocument: (node: WorkspaceRuntimeNode, document: WorkspaceRuntimeNodeDocument) => WorkspaceRuntimeNode;
  node: WorkspaceRuntimeNode;
  position?: number;
}): Promise<WorkspaceRuntimeNodeSnapshot | null> {
  if (args.isDocumentLoaded(args.node)) {
    return createWorkspaceRuntimeNodeSnapshot(args.node, args.position);
  }
  const document = await loadWorkspaceNodeDocumentFromRuntime(args.node.id).catch(() => null);
  return document ? createWorkspaceRuntimeNodeSnapshot(args.mergeDocument(args.node, document), args.position) : null;
}

export async function saveWorkspaceNodeMutationSnapshotNow(args: {
  action: string;
  command: typeof NATIVE_COMMANDS.updateNodeContent | typeof NATIVE_COMMANDS.updateNodeReveal;
  isDocumentLoaded: (node: WorkspaceRuntimeNode) => boolean;
  mergeDocument: (node: WorkspaceRuntimeNode, document: WorkspaceRuntimeNodeDocument) => WorkspaceRuntimeNode;
  node: WorkspaceRuntimeNode;
  position?: number;
}): Promise<WorkspaceNodeMutationPatchResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const payload = await createLoadedNodeSnapshot(args);
  if (!payload) {
    logRuntimeError('runtime sync failed', {
      area: 'native',
      action: args.action,
      command: args.command,
      fallback: 'none',
      error: new Error(`missing loaded document for ${args.node.id}`)
    });
    return null;
  }
  try {
    const result = await runtimeInvoke(
      args.command as NativeCommandName,
      payload as unknown as Record<string, unknown>
    );
    return isNodeMutationPatchResult(result) ? result : null;
  } catch (error) {
    logRuntimeError('runtime sync failed', {
      area: 'native',
      action: args.action,
      command: args.command,
      fallback: 'none',
      error
    });
    return null;
  }
}

export async function saveWorkspaceNodeContentSnapshotNow(args: {
  isDocumentLoaded: (node: WorkspaceRuntimeNode) => boolean;
  mergeDocument: (node: WorkspaceRuntimeNode, document: WorkspaceRuntimeNodeDocument) => WorkspaceRuntimeNode;
  node: WorkspaceRuntimeNode;
  position?: number;
}) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return false;
  }
  const payload = await createLoadedNodeSnapshot(args);
  if (!payload) {
    logRuntimeError('runtime sync failed', {
      area: 'native',
      action: 'sync_node_content_now',
      command: NATIVE_COMMANDS.updateNodeContent,
      fallback: 'throw',
      error: new Error(`missing loaded document for ${args.node.id}`)
    });
    return false;
  }
  try {
    await runtimeInvoke(NATIVE_COMMANDS.updateNodeContent, payload);
    return true;
  } catch (error) {
    logRuntimeError('runtime sync failed', {
      area: 'native',
      action: 'sync_node_content_now',
      command: NATIVE_COMMANDS.updateNodeContent,
      fallback: 'throw',
      error
    });
    return false;
  }
}
