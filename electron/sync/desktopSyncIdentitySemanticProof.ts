import Database from 'better-sqlite3';

import { compareSyncIdentityNodeFacts } from '../../lib/core/sync/syncIdentityNodeFactComparison.js';
import { readSyncIdentityNodeFactDescriptorPage,
  type SyncIdentityNodeFactSection } from '../../lib/core/sync/syncIdentityNodeFactPage.js';
import { loadSyncIdentityNodeFactDescription } from '../../lib/core/sync/syncIdentityNodeFactReadAll.js';
import { compareSyncIdentityReviewFacts } from '../../lib/core/sync/syncIdentityReviewFactComparison.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { fetchDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';

interface CandidateRow { object_id: string; source_fingerprint: string; receiver_fingerprint: string }

/** Remove only same-state node candidates proven complete under both devices' own obligations. */
export async function excludeDesktopSyncIdentitySatisfiedFacts(args: {
  candidateDb: Database.Database;
  endpointUrl: string;
  groupId: string;
  localDeviceId: string;
  localViewPath: string;
  peerViewId: string;
  secret: string;
}) {
  const local = new Database(args.localViewPath, { readonly: true, fileMustExist: true });
  let removed = 0;
  try {
    const port = createBetterSqliteDbPort(local);
    const select = args.candidateDb.prepare(`SELECT object_id, source_fingerprint,
      receiver_fingerprint FROM candidates WHERE object_type = 'node'
      AND kind = 'divergent' AND source_fingerprint = receiver_fingerprint
      AND object_id > ? ORDER BY object_id LIMIT 128`);
    const deleteSatisfied = args.candidateDb.prepare(`DELETE FROM candidates
      WHERE object_type = 'node' AND object_id = ? AND kind = 'divergent'
      AND source_fingerprint = ? AND receiver_fingerprint = ?`);
    let after = '';
    for (;;) {
      const rows = select.all(after) as CandidateRow[];
      for (const row of rows) {
        const localFacts = await loadSyncIdentityNodeFactDescription(row.object_id,
          (section, cursor) => readSyncIdentityNodeFactDescriptorPage(port, {
            nodeId: row.object_id, section, after: cursor
          }), { includeReviews: false });
        const peerFacts = await loadSyncIdentityNodeFactDescription(row.object_id,
          (section, cursor) => fetchPeerPage(args, row.object_id, section, cursor),
          { includeReviews: false });
        let comparison: ReturnType<typeof compareSyncIdentityNodeFacts>;
        try { comparison = compareSyncIdentityNodeFacts(localFacts, peerFacts); }
        catch (error) {
          if (error instanceof Error && error.message.startsWith('sync_identity_fact_projection_')) {
            continue;
          }
          throw error;
        }
        const reviews = await compareSyncIdentityReviewFacts(row.object_id, localFacts.headId,
          (section, cursor) => readSyncIdentityNodeFactDescriptorPage(port, {
            nodeId: row.object_id, section, after: cursor }),
          (section, cursor) => fetchPeerPage(args, row.object_id, section, cursor));
        if (reviews.leftNeedsRepair || reviews.rightNeedsRepair) continue;
        if (!comparison.leftNeedsRepair && !comparison.rightNeedsRepair) {
          removed += deleteSatisfied.run(row.object_id, row.source_fingerprint,
            row.receiver_fingerprint).changes;
        }
      }
      if (rows.length < 128) break;
      after = rows.at(-1)!.object_id;
    }
  } finally { local.close(); }
  return removed;
}

async function fetchPeerPage(args: Parameters<typeof excludeDesktopSyncIdentitySatisfiedFacts>[0],
  nodeId: string, section: SyncIdentityNodeFactSection, after: string | null) {
  const query = new URLSearchParams({ source_view_id: args.peerViewId,
    node_id: nodeId, section });
  if (after !== null) query.set('after', after);
  const page = await fetchDesktopWorkgroupJson<Record<string, unknown>>({
    ...args, pathWithQuery: `/companion/sync-identity-node-facts?${query}`
  });
  if (page.contract !== 'global-id-v1' || page.source_view_id !== args.peerViewId) {
    throw new Error('sync_identity_remote_fact_view_changed');
  }
  return page;
}
