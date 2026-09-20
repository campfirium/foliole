import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { resolveTopicConflict } from './syncNodeConvergence.js';
import { loadCurrentSyncNodeRecord, loadStoredSyncNodeVersionRecord } from './syncNodeGraph.js';
import { hashText } from './syncNodeResolution.js';

export interface LocalContentEdit {
  baseVersionId: string;
  versionId: string;
}

/** Uses the same version graph and resolution as an offline edit arriving from a peer. */
export async function applyLocalContentEdit(port: DbPort, input: LocalContentEdit & {
  content: string;
  hideTitleHeading: boolean;
  hostName: string;
  nodeId: string;
  title: string;
  updatedAt: string;
}, applyFastForward?: () => void) {
  return port.transaction(async (tx) => {
    const [live] = await tx.query<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM nodes WHERE id = ?', [input.nodeId]
    );
    if (!live || live.deleted_at) throw new Error('content_edit_node_unavailable');
    const base = await loadStoredSyncNodeVersionRecord(tx, input.baseVersionId, false);
    if (!base || base.object_id !== input.nodeId) throw new Error('content_edit_base_unavailable');
    const stored = await loadStoredSyncNodeVersionRecord(tx, input.versionId, false);
    const current = await loadCurrentSyncNodeRecord(tx, input.nodeId, Boolean(stored));
    if (!current) throw new Error('content_edit_current_version_unavailable');
    if (input.content === base.body_text) return { current, submittedVersionId: base.version_id! };
    const record = createEditRecord(base, input);
    if (stored && !matchesEdit(stored, record)) throw new Error('content_edit_version_mismatch');
    if (current.version_id === record.version_id || current.ancestor_version_ids.includes(input.versionId)) {
      if (!stored) throw new Error('content_edit_version_mismatch');
      return { current, submittedVersionId: input.versionId };
    }
    if (current.version_id === input.baseVersionId && applyFastForward) applyFastForward();
    else await applyBranch(tx, stored ?? record);
    const applied = await loadCurrentSyncNodeRecord(tx, input.nodeId, false);
    if (!applied) throw new Error('content_edit_result_unavailable');
    return { current: applied, submittedVersionId: input.versionId };
  });
}

function createEditRecord(base: NativeSyncNodeRecord, input: LocalContentEdit & {
  content: string; hideTitleHeading: boolean; hostName: string; title: string; updatedAt: string;
}): NativeSyncNodeRecord {
  const snapshot = {
    ...base.snapshot,
    body_blob_hash: null,
    content: input.content,
    hide_title_heading: input.hideTitleHeading,
    title: input.title,
    updated_at: input.updatedAt
  };
  return {
    ...base,
    ancestor_version_ids: [input.baseVersionId, ...base.ancestor_version_ids],
    body_text: input.content,
    content_hash: hashText(JSON.stringify(snapshot)),
    host_name: input.hostName,
    parent_version_id: input.baseVersionId,
    parent_version_ids: [input.baseVersionId],
    snapshot,
    updated_at: input.updatedAt,
    version_created_at: input.updatedAt,
    version_id: input.versionId
  };
}

function matchesEdit(stored: NativeSyncNodeRecord, record: NativeSyncNodeRecord) {
  return stored.object_id === record.object_id
    && stored.parent_version_id === record.parent_version_id
    && stored.host_name === record.host_name
    && stored.body_text === record.body_text
    && stored.snapshot.title === record.snapshot.title
    && stored.snapshot.hide_title_heading === record.snapshot.hide_title_heading
    && stored.updated_at === record.updated_at;
}

async function applyBranch(port: DbPort, record: NativeSyncNodeRecord) {
  const result = await applySyncNodesWithDbPort(port, [record], { operation: 'local_mutation' });
  if (result.blockedIds.length || result.tombstoneBlockedIds.length) throw new Error('content_edit_blocked');
  if (result.conflictNodes.length) {
    if (record.snapshot.kind !== 'topic') throw new Error('content_edit_conflict_requires_topic');
    await resolveTopicConflict(port, result.conflictNodes);
  }
}
