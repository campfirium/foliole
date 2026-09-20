import type { LocalContentEdit } from '../../lib/core/sync/localContentEdit';
import { createOpaqueVersionRef } from '../../lib/core/sync/opaqueSyncRefs';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { isLatestNodeContentVersion } from './workspaceNodeContentVersionGuard';
import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import type { WorkspaceState } from './workspaceStore';

type Node = WorkspaceState['nodesById'][string];
type WorkspaceSet = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;
const createdVersions = new Map<string, string>();
const confirmedBranches = new Map<string, { baseVersionIds: Set<string>; submittedVersionId: string }>();

export function captureContentEdit(node: Node): LocalContentEdit | undefined {
  const baseVersionId = node.currentVersionId ?? createdVersions.get(node.id);
  if (!baseVersionId) return undefined;
  return { baseVersionId, versionId: createOpaqueVersionRef(crypto.randomUUID()) };
}

export function continueContentEdit(nodeId: string, edit: LocalContentEdit | undefined) {
  if (!edit) return;
  const confirmed = confirmedBranches.get(nodeId);
  if (confirmed?.baseVersionIds.has(edit.baseVersionId)) edit.baseVersionId = confirmed.submittedVersionId;
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
  const previous = confirmedBranches.get(args.node.id);
  const baseVersionIds = previous?.submittedVersionId === args.edit.baseVersionId
    ? previous.baseVersionIds : new Set<string>();
  baseVersionIds.add(args.edit.baseVersionId);
  confirmedBranches.set(args.node.id, {
    baseVersionIds,
    submittedVersionId: acknowledgement.submittedVersionId
  });
  args.set((state) => {
    const current = state.nodesById[args.node.id];
    if (!current) return {};
    const node = isLatestNodeContentVersion(args.node.id, args.version) ? {
      ...current,
      content: persisted.content,
      currentVersionId: acknowledgement.currentVersionId,
      hasContent: persisted.content.trim().length > 0,
      hideTitleHeading: persisted.hideTitleHeading ?? false,
      title: persisted.title,
      updatedAt: persisted.updatedAt
    } : { ...current, currentVersionId: acknowledgement.submittedVersionId };
    syncWorkspaceNodeDocumentCacheFromNode(node);
    return { nodesById: { ...state.nodesById, [node.id]: node } };
  });
}

export function rememberCreatedContentVersion(nodeId: string, versionId: string) {
  createdVersions.set(nodeId, versionId);
}

export function resetContentEditAcknowledgementsForTests() {
  confirmedBranches.clear();
  createdVersions.clear();
}
