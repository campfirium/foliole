import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview';
import type { LocalContentEdit } from '../../lib/core/sync/localContentEdit';
import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';
import { patchWorkspaceRecord } from '../shared/workspaceRecordPatch';

import { isLatestNodeContentVersion } from './workspaceNodeContentVersionGuard';
import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import type { WorkspaceState } from './workspaceStore';

type Node = WorkspaceState['nodesById'][string];
type WorkspaceSet = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;
export type ContentEditAcknowledgement =
  | { type: 'created'; nodeId: string; versionId: string }
  | { type: 'saved'; nodeId: string; baseVersionId: string; submittedVersionId: string; currentVersionId: string };
const listeners = new Set<(event: ContentEditAcknowledgement) => void>();

export function subscribeContentEditAcknowledgements(listener: (event: ContentEditAcknowledgement) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function captureContentEdit(node: Node, baseContent?: string): LocalContentEdit | undefined {
  const baseVersionId = node.currentVersionId;
  if (!baseVersionId) return undefined;
  return {
    baseVersionId,
    ...(baseContent !== undefined ? { baseContent } : {}),
    ...(node.pendingImageReferences?.length ? { newImageReferences: node.pendingImageReferences } : {}),
    versionId: createOpaqueVersionRef(crypto.randomUUID())
  };
}

export function acknowledgeContentEdit(args: {
  edit: LocalContentEdit | undefined;
  node: Node;
  result: WorkspaceNodeMutationPatchResult | null;
  set: WorkspaceSet;
  version: number;
}) {
  const acknowledgement = args.result?.contentEdit;
  if (!args.edit || !acknowledgement) return;
  const persisted = args.result?.nodes.find((node) => node.nodeId === args.node.id);
  if (!persisted) return;
  for (const listener of listeners) listener({ type: 'saved', nodeId: args.node.id,
    baseVersionId: args.edit.baseVersionId, ...acknowledgement });
  args.set((state) => {
    const current = state.nodesById[args.node.id];
    if (!current) return {};
    const node: Node = isLatestNodeContentVersion(args.node.id, args.version) ? {
      ...current,
      bodyStatus: persisted.content.trim().length > 0 ? 'ready' : 'empty',
      content: persisted.content,
      currentVersionId: acknowledgement.currentVersionId,
      pendingImageReferences: (current.pendingImageReferences ?? []).filter(reference => !args.edit?.newImageReferences?.some(
        saved => saved.storage_key === reference.storage_key && saved.original_name === reference.original_name)),
      hasContent: persisted.content.trim().length > 0,
      hideTitleHeading: persisted.hideTitleHeading ?? false,
      title: persisted.title,
      openingText: resolveNodeOpeningText(persisted.content, persisted.title),
      updatedAt: persisted.updatedAt
    } : { ...current, currentVersionId: acknowledgement.submittedVersionId };
    syncWorkspaceNodeDocumentCacheFromNode(node);
    return { nodesById: patchWorkspaceRecord(state.nodesById, { [node.id]: node }) };
  });
}

export function acknowledgeCreatedContentVersion(nodeId: string, versionId: string) {
  for (const listener of listeners) listener({ type: 'created', nodeId, versionId });
}
