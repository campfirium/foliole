import {
  advanceSyncPackDependencyDigest, SYNC_PACK_DEPENDENCY_INITIAL_DIGEST,
  type SyncPackNodeDependencyObjectType,
  type SyncPackDependencyRow
} from '../../lib/core/sync/syncPackDependencyTransfer.js';
import type { SyncPackFactClaims } from '../../lib/core/sync/syncPackFactPresence.js';

import {
  readSyncPackDependencyPage, type SyncPackDependencyBudget,
  type SyncPackDependencyPosition, type SyncPackDependencyTable
} from './syncPackDependencyRows.js';
import type { openSyncPackSourceView } from './syncPackSourceView.js';

interface DependencySourceArgs {
  view: ReturnType<typeof openSyncPackSourceView>;
  objectId: string;
  nodeIds?: string[];
  objectType: SyncPackNodeDependencyObjectType;
  budget: SyncPackDependencyBudget;
  after?: { table: SyncPackDependencyTable; position: SyncPackDependencyPosition };
  claims?: SyncPackFactClaims;
  claimDatabase?: boolean;
}

export function* iterateSyncPackDependencyPages(args: DependencySourceArgs) {
  const tables: SyncPackDependencyTable[] = ['node_sync_versions', 'node_sync_version_parents'];
  if (args.objectType === 'node_review') tables.push('review_log');
  const start = args.after ? tables.indexOf(args.after.table) : 0;
  if (start < 0) throw new Error('sync_pack_dependency_resume_table_invalid');
  for (const table of tables.slice(start)) {
    let after = table === args.after?.table ? args.after.position : undefined;
    while (true) {
      const page = readSyncPackDependencyPage(args.view.driver, {
        table, objectId: args.objectId, budget: args.budget, ...(after ? { after } : {}),
        ...(args.nodeIds ? { nodeIds: args.nodeIds } : {}),
        ...(args.claims ? { claims: args.claims } : {}),
        ...(args.claimDatabase ? { claimDatabase: true } : {})
      });
      if (page.rows.length) yield page.rows.map((row): SyncPackDependencyRow => ({
        table, key: row.position, json: row.json
      }));
      if (page.complete) break;
      after = page.next!;
    }
  }
}

export function describeSyncPackDependencySource(args: Omit<DependencySourceArgs, 'after'>) {
  let expectedRows = 0;
  let expectedDigest = SYNC_PACK_DEPENDENCY_INITIAL_DIGEST;
  for (const page of iterateSyncPackDependencyPages({ view: args.view, objectId: args.objectId,
    objectType: args.objectType, budget: args.budget, ...(args.claims ? { claims: args.claims } : {}),
    ...(args.nodeIds ? { nodeIds: args.nodeIds } : {}),
    ...(args.claimDatabase ? { claimDatabase: true } : {}) })) {
    for (const row of page) {
      expectedRows++;
      expectedDigest = advanceSyncPackDependencyDigest(expectedDigest, row);
    }
  }
  return { expectedRows, expectedDigest };
}
