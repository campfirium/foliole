import Database from 'better-sqlite3';

import { buildSyncIdentityCandidatePage } from '../../lib/core/sync/syncIdentityCandidatePage.js';

interface CandidateRow {
  object_type: string;
  object_id: string;
  fingerprint: string;
}

export interface IdentityCandidatePageRequest {
  candidatePath: string;
  groupId: string;
  sourcePeerId: string;
  targetPeerId: string;
  sourceViewId: string;
  pageIndex: number;
  previousPageId: string | null;
  restoreId?: string;
  restoreSetId?: string;
  after: { object_type: string; object_id: string } | null;
  direction: 'source' | 'receiver';
  limit?: number;
}

/** The candidate file is committed only after the complete summary diff validates. */
export function readDesktopSyncIdentityCandidatePage(args: IdentityCandidatePageRequest) {
  const limit = args.limit ?? 128;
  if (!['source', 'receiver'].includes(args.direction) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 128 ||
      args.after && (!args.after.object_type || !args.after.object_id)) {
    throw new Error('sync_identity_candidate_page_invalid');
  }
  const db = new Database(args.candidatePath, { readonly: true, fileMustExist: true });
  try {
    const fingerprintColumn = args.direction === 'source' ? 'source_fingerprint' : 'receiver_fingerprint';
    const kind = args.direction === 'source' ? 'source_only' : 'receiver_only';
    const rows = db.prepare(`SELECT object_type, object_id, ${fingerprintColumn} AS fingerprint
      FROM candidates WHERE kind IN (?, 'divergent') AND
        (object_type > ? OR (object_type = ? AND object_id > ?))
      ORDER BY object_type, object_id LIMIT ?`).all(
      kind,
      args.after?.object_type ?? '', args.after?.object_type ?? '',
      args.after?.object_id ?? '', limit + 1
    ) as CandidateRow[];
    return buildSyncIdentityCandidatePage(args, rows);
  } finally { db.close(); }
}
