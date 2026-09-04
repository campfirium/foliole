import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { NativeWorkspaceReviewProfile } from '../../lib/platform/nativeStorageContract';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract';
import {
  deriveNodeTitleForCloze,
  deriveNodeTitleFromContent
} from '../features/nodes/model/deriveNodeTitle';
import { runCompanionSyncOptionalMutationTask } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import {
  applyCompanionSyncNodeVersions,
  applyCompanionSyncNodeVersionsWithinWriterTask,
  saveCompanionSyncNodeReviewRecordWithinWriterTask,
  saveCompanionSyncNodeReviewRecord
} from '../shared/platform/companionSyncObjects';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import {
  createSelectionAnnotatedHighlightContent,
  createSelectionAnnotationAnchorLink,
  createSelectionClozeDraft,
  createSelectionHighlightContent,
  type SelectionAnnotationPayload
} from '../shared/selectionAnnotationActions';
import { createNewItemReviewProfiles } from '../store/newItemReviewSlots';

import {
  toCompanionNativeNodeVersion
} from './companionAnnotationNodeVersion';
import { appendCompanionExistingHighlightNote } from './companionExistingHighlightActions';

interface PersistSelectionAnnotationArgs {
  deviceId: string;
  kind: 'cloze' | 'highlight' | 'note';
  note?: string;
  payload: SelectionAnnotationPayload;
  snapshot: WorkspaceSnapshot | null;
}

interface AnnotationDraft {
  node: WorkspaceNodeSnapshot;
  nodeVersion: NativeSyncNodeRecord;
  review: NativeWorkspaceReviewProfile | null;
  snapshot: WorkspaceSnapshot;
}

function createNode(args: {
  content: string;
  kind: 'item' | 'topic';
  parentNodeId: string;
  payload: SelectionAnnotationPayload;
  review: NativeWorkspaceReviewProfile | null;
  reveal: string | null;
  timestamp: string;
  title: string;
}): WorkspaceNodeSnapshot {
  return {
    anchorLink: createSelectionAnnotationAnchorLink(args.payload, args.kind === 'item' ? 'cloze' : 'highlight') ?? null,
    content: args.content,
    createdAt: args.timestamp,
    hideTitleHeading: false,
    id: `node-${createCompanionUuid()}`,
    imageRegions: args.payload.imageRegions ?? null,
    isTitleManual: false,
    kind: args.kind,
    openingText: null,
    parentNodeId: args.parentNodeId,
    reading: null,
    reveal: args.reveal,
    review: args.review,
    title: args.title,
    updatedAt: args.timestamp
  };
}

async function buildAnnotationDraft(args: PersistSelectionAnnotationArgs): Promise<AnnotationDraft | null> {
  const parentNode = args.snapshot?.nodesById[args.payload.parentNodeId];
  if (!args.snapshot || !parentNode || args.snapshot.trashedNodeIds.includes(parentNode.id)) {
    return null;
  }
  const timestamp = new Date().toISOString();
  const cloze = createSelectionClozeDraft(args.payload);
  const content = args.kind === 'cloze'
    ? cloze.prompt
    : args.kind === 'note'
      ? createSelectionAnnotatedHighlightContent(args.payload, args.note)
      : createSelectionHighlightContent(args.payload);
  if (!content || (args.kind === 'cloze' && !cloze.answer)) {
    return null;
  }
  const node = createNode({
    content,
    kind: args.kind === 'cloze' ? 'item' : 'topic',
    parentNodeId: parentNode.id,
    payload: args.payload,
    review: args.kind === 'cloze'
      ? createNewItemReviewProfiles({ batchSize: 1, nodesById: args.snapshot.nodesById, now: timestamp })[0]!
      : null,
    reveal: args.kind === 'cloze' ? cloze.answer : null,
    timestamp,
    title: args.kind === 'cloze' ? deriveNodeTitleForCloze(content, cloze.answer) : deriveNodeTitleFromContent(content)
  });
  const nodeVersion = await toCompanionNativeNodeVersion(node, args.deviceId);
  const versionedNode = { ...node, currentVersionId: nodeVersion.version_id };
  return {
    node: versionedNode,
    nodeVersion,
    review: versionedNode.review,
    snapshot: {
      ...args.snapshot,
      nodeOrder: [...args.snapshot.nodeOrder, versionedNode.id],
      nodesById: { ...args.snapshot.nodesById, [versionedNode.id]: versionedNode }
    }
  };
}

export async function persistCompanionSelectionAnnotation(args: PersistSelectionAnnotationArgs) {
  if (isAvailableNativeCompanionRuntime()) {
    return persistNativeSelectionAnnotation(args);
  }
  const draft = await buildAnnotationDraft(args);
  if (!draft) {
    return null;
  }
  await applyCompanionSyncNodeVersions([draft.nodeVersion]);
  if (draft.review) {
    await saveCompanionSyncNodeReviewRecord({ nodeId: draft.node.id, review: draft.review });
  }
  return {
    nodeId: draft.node.id,
    snapshot: draft.snapshot
  };
}

async function persistNativeSelectionAnnotation(args: PersistSelectionAnnotationArgs) {
  return runCompanionSyncOptionalMutationTask(async () => {
    const currentState = await loadCompanionWorkspaceSyncState();
    const draft = await buildAnnotationDraft({ ...args, snapshot: currentState.workspace_snapshot });
    if (!draft) return null;
    await applyCompanionSyncNodeVersionsWithinWriterTask([draft.nodeVersion]);
    if (draft.review) {
      await saveCompanionSyncNodeReviewRecordWithinWriterTask({ nodeId: draft.node.id, review: draft.review });
    }
    const nextSnapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
    if (!nextSnapshot?.nodesById[draft.node.id]) {
      throw new Error('companion_annotation_snapshot_not_converged');
    }
    return { nodeId: draft.node.id, snapshot: nextSnapshot };
  });
}

async function persistExistingHighlightNode(args: {
  deviceId: string;
  node: WorkspaceNodeSnapshot;
  snapshot: WorkspaceSnapshot;
  update: (node: WorkspaceNodeSnapshot, timestamp: string) => WorkspaceNodeSnapshot;
}) {
  const node = args.update(args.node, new Date().toISOString());
  const nodeVersion = await toCompanionNativeNodeVersion(node, args.deviceId);
  const versionedNode = { ...node, currentVersionId: nodeVersion.version_id };
  await applyCompanionSyncNodeVersions([nodeVersion]);
  return {
    nodeId: versionedNode.id,
    snapshot: {
      ...args.snapshot,
      trashedNodeIds: versionedNode.deletedAt
        ? [...new Set([...args.snapshot.trashedNodeIds, versionedNode.id])]
        : args.snapshot.trashedNodeIds,
      nodesById: { ...args.snapshot.nodesById, [versionedNode.id]: versionedNode }
    }
  };
}

export async function addNoteToCompanionExistingHighlight(args: {
  deviceId: string;
  nodeId: string;
  note: string;
  originalText: string;
  snapshot: WorkspaceSnapshot | null;
}) {
  const node = args.snapshot?.nodesById[args.nodeId];
  if (!args.snapshot || !node || args.snapshot.trashedNodeIds.includes(args.nodeId)) return null;
  return persistExistingHighlightNode({
    deviceId: args.deviceId,
    node,
    snapshot: args.snapshot,
    update: (current, timestamp) => ({
      ...current,
      content: appendCompanionExistingHighlightNote({ node: current, note: args.note, originalText: args.originalText }),
      updatedAt: timestamp
    })
  });
}

export async function deleteCompanionExistingHighlight(args: {
  deviceId: string;
  nodeId: string;
  snapshot: WorkspaceSnapshot | null;
}) {
  const node = args.snapshot?.nodesById[args.nodeId];
  if (!args.snapshot || !node || args.snapshot.trashedNodeIds.includes(args.nodeId)) return null;
  return persistExistingHighlightNode({
    deviceId: args.deviceId,
    node,
    snapshot: args.snapshot,
    update: (current, timestamp) => ({
      ...current,
      deletedAt: timestamp,
      updatedAt: timestamp
    })
  });
}
