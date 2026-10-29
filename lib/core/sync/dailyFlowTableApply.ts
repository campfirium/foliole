import { bytesToHex } from '@noble/hashes/utils.js';

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
  for (const fact of table.facts) {
    const header = table.headers.get(fact.id)!;
    const record = { object_type: 'daily_flow' as const, object_id: fact.id, payload_json: JSON.stringify(fact),
      content_hash: bytesToHex(header.contentHash), updated_at: fact.occurredAt, deleted_at: null };
    if (await dailyFlowFactApplyStatus(db, record) === 'apply') {
      await applyDailyFlowSyncFact(db, record);
      await upsertAppliedSyncObjectState(db, record);
    }
  }
  return { generatedChanges: false, workspaceScope: { kind: 'full' as const } };
}
