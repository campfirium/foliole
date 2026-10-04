import { buildSyncIdentityPackPage, type SyncIdentityPackObject
} from './syncIdentityPackPage.js';

export interface SyncIdentityCandidateRow {
  object_type: string;
  object_id: string;
  fingerprint: string;
}

export interface SyncIdentityCandidatePageInput {
  groupId: string;
  sourcePeerId: string;
  targetPeerId: string;
  sourceViewId: string;
  pageIndex: number;
  previousPageId: string | null;
  restoreId?: string;
  restoreSetId?: string;
  direction: 'source' | 'receiver';
  limit?: number;
}

/** Build a bounded page from globally sorted candidate rows, including one lookahead row. */
export function buildSyncIdentityCandidatePage(input: SyncIdentityCandidatePageInput,
  rows: readonly SyncIdentityCandidateRow[]) {
  const limit = input.limit ?? 128;
  if (!['source', 'receiver'].includes(input.direction) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 128) {
    throw new Error('sync_identity_candidate_page_invalid');
  }
  const objects: SyncIdentityPackObject[] = [];
  for (const row of rows.slice(0, limit)) {
    if (!row.fingerprint) throw new Error('sync_identity_candidate_page_invalid');
    const next = [...objects, { object_type: row.object_type,
      object_id: row.object_id, fingerprint: row.fingerprint }];
    if (new TextEncoder().encode(JSON.stringify(next)).length > 65536) {
      if (objects.length === 0) throw new Error('sync_identity_candidate_item_too_large');
      break;
    }
    objects.push(next.at(-1)!);
  }
  const page = buildSyncIdentityPackPage({
    group_id: input.groupId, source_peer_id: input.sourcePeerId,
    target_peer_id: input.targetPeerId, source_view_id: input.sourceViewId,
    page_index: input.pageIndex, previous_page_id: input.previousPageId, objects,
    ...(input.restoreId === undefined ? {} : { restore_id: input.restoreId }),
    ...(input.restoreSetId === undefined ? {} : { restore_set_id: input.restoreSetId })
  });
  return { page, nextAfter: rows.length > objects.length ? {
    object_type: objects.at(-1)!.object_type, object_id: objects.at(-1)!.object_id
  } : null };
}
