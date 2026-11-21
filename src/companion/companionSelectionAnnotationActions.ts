import { loadCompanionWorkspaceNodeFromDb } from '../../lib/core/database/companionWorkspaceNodeRead';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { createInitialNewItemReviewProfile } from '../../lib/core/review/newItemReviewSlots';
import type { NativeWorkspaceReviewProfile } from '../../lib/platform/nativeStorageContract';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract';
import {
  deriveNodeTitleForCloze,
  deriveNodeTitleFromContent
} from '../features/nodes/model/deriveNodeTitle';
import { getHighlightAnnotationPrefix } from '../shared/config/highlightAnnotationPrefixSetting';
import { recordCompanionAnnotationHistory } from '../shared/platform/companion/editing/companionEditHistoryRecording';
import { loadNewItemReviewLoadWithDb } from '../shared/platform/companion/runtime/companionNewItemReviewLoad';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { saveIosReviewWithDb } from '../shared/platform/companion/runtime/iosCompanionActiveDatabaseWrites';
import { runCompanionOptionalHighValueMutationTask } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { applyCompanionSyncNodeVersionsWithDbPort } from '../shared/platform/companionSyncNodeVersions';
import {
  applyCompanionLocalNodeVersions,
  saveCompanionSyncNodeReviewRecord
} from '../shared/platform/companionSyncObjects';
import { toReviewPayload } from '../shared/platform/companionSyncStateWriters';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import {
  createSelectionAnnotatedHighlightContent,
  createSelectionAnnotationAnchorLink,
  createSelectionClozeDraft,
  createSelectionHighlightContent,
  type SelectionAnnotationPayload
} from '../shared/selectionAnnotationActions';
import { canCreateSelectionAnnotation } from '../shared/selectionAnnotationEligibility';
import { allocateNewItemReviewDueDates } from '../store/newItemReviewSlots';

import { toCompanionNativeNodeVersion } from './companionAnnotationNodeVersion';
export { addNoteToCompanionExistingHighlight, deleteCompanionExistingHighlight } from './companionExistingHighlightPersistence';

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
}

/** What a new annotation consumes: its parent and, for a cloze, the review load it spreads over. */
interface AnnotationSource {
  parentNode: WorkspaceNodeSnapshot | null | undefined;
  reviewNodes: Iterable<{ kind: string; review?: { due: string } | null } | undefined>;
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

async function buildAnnotationDraft(args: PersistSelectionAnnotationArgs, source: AnnotationSource): Promise<AnnotationDraft | null> {
  const parentNode = source.parentNode;
  if (!parentNode || !canCreateSelectionAnnotation(parentNode) || parentNode.deletedAt) {
    return null;
  }
  const timestamp = new Date().toISOString();
  const cloze = createSelectionClozeDraft(args.payload);
  const content = args.kind === 'cloze'
    ? cloze.prompt
    : args.kind === 'note'
      ? createSelectionAnnotatedHighlightContent(args.payload, args.note, getHighlightAnnotationPrefix())
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
      ? createInitialNewItemReviewProfile(allocateNewItemReviewDueDates({ batchSize: 1, nodes: source.reviewNodes, now: timestamp })[0]!)
      : null,
    reveal: args.kind === 'cloze' ? cloze.answer : null,
    timestamp,
    title: args.kind === 'cloze' ? deriveNodeTitleForCloze(content, cloze.answer) : deriveNodeTitleFromContent(content)
  });
  const nodeVersion = await toCompanionNativeNodeVersion(node, args.deviceId);
  const versionedNode = { ...node, currentVersionId: nodeVersion.version_id };
  return { node: versionedNode, nodeVersion, review: versionedNode.review };
}

function snapshotSource(snapshot: WorkspaceSnapshot | null, parentNodeId: string): AnnotationSource {
  const parentNode = snapshot?.nodesById[parentNodeId];
  // The snapshot keeps Trash facts apart from the node it projects.
  const trashed = parentNode && snapshot!.trashedNodeIds.includes(parentNode.id);
  return { parentNode: trashed ? null : parentNode, reviewNodes: Object.values(snapshot?.nodesById ?? {}) };
}

function withAnnotation(snapshot: WorkspaceSnapshot, node: WorkspaceNodeSnapshot): WorkspaceSnapshot {
  return {
    ...snapshot,
    nodeOrder: [...snapshot.nodeOrder, node.id],
    nodesById: { ...snapshot.nodesById, [node.id]: node }
  };
}

export async function persistCompanionSelectionAnnotation(args: PersistSelectionAnnotationArgs) {
  if (isAvailableNativeCompanionRuntime()) {
    return persistNativeSelectionAnnotation(args);
  }
  if (!args.snapshot) return null;
  const draft = await buildAnnotationDraft(args, snapshotSource(args.snapshot, args.payload.parentNodeId));
  if (!draft) {
    return null;
  }
  await applyCompanionLocalNodeVersions([draft.nodeVersion]);
  if (draft.review) {
    await saveCompanionSyncNodeReviewRecord({ nodeId: draft.node.id, review: draft.review });
  }
  return {
    nodeId: draft.node.id,
    snapshot: withAnnotation(args.snapshot, draft.node)
  };
}

/**
 * The write reads only the parent and, for a cloze, the review load of the days it may be due on; the refresh then
 * merges the new node instead of rereading the library.
 */
async function persistNativeSelectionAnnotation(args: PersistSelectionAnnotationArgs) {
  if (!args.snapshot) return null;
  const snapshot = args.snapshot;
  return runCompanionOptionalHighValueMutationTask(async () => {
    const draft = await writeIosCompanionDatabase(db => db.transaction(async tx => {
      const parentNode = await loadCompanionWorkspaceNodeFromDb(tx, args.payload.parentNodeId);
      const reviewNodes = args.kind === 'cloze' ? await loadNewItemReviewLoadWithDb(tx, new Date().toISOString()) : [];
      const built = await buildAnnotationDraft(args, { parentNode, reviewNodes });
      if (!built) return null;
      const ids = await applyCompanionSyncNodeVersionsWithDbPort(tx, [built.nodeVersion], 'local_mutation');
      if (!ids.includes(built.node.id)) throw new Error('companion_annotation_not_applied');
      await recordCompanionAnnotationHistory(tx, { documentId: args.payload.parentNodeId, before: null, after: built.node });
      if (built.review) await saveIosReviewWithDb(tx, {
        node_id: built.node.id, review_json: JSON.stringify(toReviewPayload(built.review))
      });
      return built;
    }), { kind: 'business' });
    if (!draft) return null;
    return { nodeId: draft.node.id, published: true as const, snapshot: withAnnotation(snapshot, draft.node) };
  }, result => ({ kind: 'nodes', nodeIds: [result.nodeId], structure: true, metadata: true,
    ...(args.kind === 'cloze' ? { reviewNodeIds: [result.nodeId] } : {}) }));
}
