import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { loadMergeBaseCandidates, type StoredSyncNodeVersionRow } from './syncNodeGraph.js';

export async function loadTopicConflictBase(
  port: DbPort,
  local: NativeSyncNodeRecord,
  incoming: NativeSyncNodeRecord,
  currentBody: string
) {
  const candidates = await loadMergeBaseCandidates(port, local.version_id!, incoming.version_id!);
  if (candidates.length > 1) {
    const incomingBody = incoming.body_text ?? incoming.snapshot.content;
    // Equal available heads need no body base; moving and deleting still require causal evidence.
    if (typeof incomingBody !== 'string' || currentBody !== incomingBody
      || local.snapshot.parent_id !== incoming.snapshot.parent_id
      || local.snapshot.deleted_at !== incoming.snapshot.deleted_at) {
      throw new Error('sync_node_merge_base_ambiguous');
    }
    return { base: null, matchingHeads: true };
  }
  const [base] = candidates.length ? await port.query<StoredSyncNodeVersionRow>(
    'SELECT * FROM node_sync_versions WHERE version_id = ? LIMIT 1', [candidates[0]!]
  ) : [];
  return { base: base ?? null, matchingHeads: false };
}
