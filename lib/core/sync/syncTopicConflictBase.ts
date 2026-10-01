import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { loadMergeBaseCandidates, storedSyncNodeVersionBody, type StoredSyncNodeVersionRow } from './syncNodeGraph.js';

export async function loadTopicConflictBase(
  port: DbPort,
  local: NativeSyncNodeRecord,
  incoming: NativeSyncNodeRecord,
  currentBody: string
) {
  const candidates = await loadMergeBaseCandidates(port, local.version_id!, incoming.version_id!);
  if (candidates.length > 1) {
    const bases = await Promise.all(candidates.map(async (versionId) => {
      const [base] = await port.query<StoredSyncNodeVersionRow>(
        'SELECT * FROM node_sync_versions WHERE version_id = ? LIMIT 1', [versionId]);
      return base;
    }));
    const readable = bases.filter((base): base is StoredSyncNodeVersionRow => base !== undefined);
    const body = readable[0] ? storedSyncNodeVersionBody(readable[0]) : null;
    if (readable.length === candidates.length && body !== null &&
        readable.every((base) => storedSyncNodeVersionBody(base) === body)) {
      readable.sort((left, right) => left.created_at.localeCompare(right.created_at) ||
        left.version_id.localeCompare(right.version_id));
      return { base: readable[0]!, matchingHeads: false };
    }
    const incomingBody = incoming.body_text ?? incoming.snapshot.content;
    return { base: null, matchingHeads: typeof incomingBody === 'string' && currentBody === incomingBody &&
      local.snapshot.parent_id === incoming.snapshot.parent_id &&
      local.snapshot.deleted_at === incoming.snapshot.deleted_at };
  }
  const [base] = candidates.length ? await port.query<StoredSyncNodeVersionRow>(
    'SELECT * FROM node_sync_versions WHERE version_id = ? LIMIT 1', [candidates[0]!]
  ) : [];
  return { base: base ?? null, matchingHeads: false };
}
