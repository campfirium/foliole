import type { DbPort } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { selectNodeOperationValue } from './syncNodeOperationValue.js';
import { chooseNodeTextProjection } from './syncNodeResolution.js';
import { buildVerifiedResolutionRecord } from './syncNodeResolutionBody.js';
import { loadTopicTextConflictMetadata, selectChangedTopicMain } from './topicTextConflictMetadata.js';
import { topicTextSelectionChildCount } from './topicTextSelectionChildCount.js';
import { mergeVerifiedTopicTextAttachments, requireReadableVerifiedNode, type ReadableVerifiedSyncNode } from './topicTextVerifiedMerge.js';

/** The caller owns the transaction and all body references throughout resolution and adoption. */
export async function resolveVerifiedTopicConflict(db: DbPort, current: VerifiedFramedSyncNode,
  incoming: readonly VerifiedFramedSyncNode[], formedAt: string): Promise<VerifiedFramedSyncNode> {
  const local = requireReadableVerifiedNode(current);
  const ordered = [...incoming].sort((left, right) =>
    (left.metadata.version_id ?? '').localeCompare(right.metadata.version_id ?? ''));
  if (!local.metadata.version_id || ordered.some((record) => !record.metadata.version_id)) {
    throw new Error(`sync_topic_conflict_version_missing:${local.metadata.object_id}`);
  }
  const branches = ordered.filter((record) => record.metadata.version_id !== local.metadata.version_id &&
    !local.metadata.ancestor_version_ids.includes(record.metadata.version_id!)).map(requireReadableVerifiedNode);
  if (!branches.length) return current;
  const state = await selectTopicState(db, local, branches);
  const snapshot = { ...state.winner.metadata.snapshot, parent_id: state.parent.value,
    deleted_at: state.deletion.value, text_selection: state.winner.metadata.snapshot.text_selection ?? {
      version_id: state.winner.metadata.version_id!, created_at: state.winner.metadata.version_created_at!
    }, text_alternatives: [] };
  delete snapshot.position;
  const merged = snapshot.deleted_at ? { alternatives: [], bodies: [] } :
    await mergeVerifiedTopicTextAttachments(db, [local, ...branches], state.winner, formedAt);
  const result = await buildVerifiedResolutionRecord(db, [local, ...branches], state.winner,
    state.winner.body.ref, { ...snapshot, text_alternatives: merged.alternatives });
  return { ...result, alternativeBodies: merged.bodies };
}

async function selectTopicState(db: DbPort, local: ReadableVerifiedSyncNode, ordered: readonly ReadableVerifiedSyncNode[]) {
  let winner = local;
  let parent = { value: local.metadata.snapshot.parent_id, source: local.metadata };
  let deletion = { value: local.metadata.snapshot.deleted_at, source: local.metadata };
  for (const incoming of ordered) {
    const base = await loadTopicTextConflictMetadata(db, local.metadata, incoming.metadata);
    parent = selectNodeOperationValue(base?.parent_id, parent, incoming.metadata.snapshot.parent_id, incoming.metadata);
    deletion = selectNodeOperationValue(base?.deleted_at, deletion, incoming.metadata.snapshot.deleted_at, incoming.metadata);
    if (winner.body.ref.hash === incoming.body.ref.hash) {
      winner = chooseWinner(winner, incoming, 0, 0);
    } else {
      const changed = await selectChangedTopicMain(db, winner.metadata, incoming.metadata);
      if (changed) winner = changed === winner.metadata ? winner : incoming;
      else winner = chooseWinner(winner, incoming,
        await topicTextSelectionChildCount(db, winner.metadata), await topicTextSelectionChildCount(db, incoming.metadata));
    }
  }
  return { winner, parent, deletion };
}

function chooseWinner(local: ReadableVerifiedSyncNode, incoming: ReadableVerifiedSyncNode, localAnchors: number, incomingAnchors: number) {
  const chosen = chooseNodeTextProjection(local.metadata, incoming.metadata,
    local.body.ref.utf16Length, incoming.body.ref.utf16Length, localAnchors, incomingAnchors);
  return chosen === local.metadata ? local : incoming;
}
