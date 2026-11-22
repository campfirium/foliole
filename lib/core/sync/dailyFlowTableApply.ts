import { bytesToHex } from '@noble/hashes/utils.js';

import type { WorkspaceRefreshScope } from '../database/workspaceSnapshotRefresh.js';
import { applyDailyFlowSyncFact, dailyFlowFactApplyStatus } from '../flow/dailyFlowSyncApply.js';

import type { DailyFlowTableFiles } from './dailyFlowTableFiles.js';
import { readDailyFlowTable } from './dailyFlowTableRead.js';
import type { DbPort } from './dbPort.js';
import { upsertAppliedSyncObjectState } from './syncObjectApplyExecutor.js';

/** Learning operations share the inbound transaction; each device owns its list. */
export async function applyDailyFlowTable(db: DbPort, files: DailyFlowTableFiles, requestedId: string,
  _hostName: string, sourceStateHash?: Uint8Array) {
  const table = await readDailyFlowTable(files, requestedId);
  if (table.begin.purpose !== 'operation') throw new Error('daily_flow_local_list_not_transferable');
  if (sourceStateHash && bytesToHex(table.headers.get(requestedId)!.contentHash) !== bytesToHex(sourceStateHash)) {
    throw new Error('daily_flow_table_source_hash_invalid');
  }
  const reviewNodeIds = new Set<string>();
  const readingNodeIds = new Set<string>();
  let applied = false;
  for (const fact of table.facts) {
    const header = table.headers.get(fact.id)!;
    const record = { object_type: 'daily_flow' as const, object_id: fact.id, payload_json: JSON.stringify(fact),
      content_hash: bytesToHex(header.contentHash), updated_at: fact.occurredAt, deleted_at: null };
    if (await dailyFlowFactApplyStatus(db, record) === 'apply') {
      await applyDailyFlowSyncFact(db, record);
      await upsertAppliedSyncObjectState(db, record);
      applied = true;
      if (fact.nodeId) reviewNodeIds.add(fact.nodeId);
      for (const reading of fact.readings ?? []) readingNodeIds.add(reading.nodeId);
    }
  }
  return { generatedChanges: false, workspaceScope: dailyFlowWorkspaceScope(applied, reviewNodeIds, readingNodeIds) };
}

/**
 * Facts change only the Flow tables. Naming the nodes they touched lets the receiver reread just those, which
 * still hands it a new node map so an open Flow reopens; a table whose facts were all present changes nothing.
 */
function dailyFlowWorkspaceScope(applied: boolean, reviewNodeIds: ReadonlySet<string>,
  readingNodeIds: ReadonlySet<string>): WorkspaceRefreshScope {
  if (!applied) return { kind: 'nodes', nodeIds: [] };
  if (!reviewNodeIds.size && !readingNodeIds.size) return { kind: 'full' };
  return { kind: 'nodes', nodeIds: [],
    ...(reviewNodeIds.size ? { reviewNodeIds: [...reviewNodeIds] } : {}),
    ...(readingNodeIds.size ? { readingNodeIds: [...readingNodeIds] } : {}) };
}
