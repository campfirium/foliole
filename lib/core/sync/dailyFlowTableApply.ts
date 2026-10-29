import { bytesToHex } from '@noble/hashes/utils.js';

import { storeDailyFlowFact } from '../flow/dailyFlowFactStorage.js';
import { readDailyFlowProjectionFacts, replaceDailyFlowProjectionFacts } from '../flow/dailyFlowProjectionFacts.js';
import { qualifyReceivedDailyFlow } from '../flow/dailyFlowReceivedQualification.js';
import { insertCycleRows, readDailyFlow, saveCycleFlow } from '../flow/dailyFlowStorage.js';
import { dailyFlowFactApplyStatus } from '../flow/dailyFlowSyncApply.js';
import { readRelatedDailyFlowFacts } from '../flow/dailyFlowSyncFacts.js';
import { connectedFlowFacts, mergeDailyFlowFacts } from '../flow/dailyFlowSyncMerge.js';
import { projectDailyFlowSync } from '../flow/dailyFlowSyncProjection.js';

import { assertDailyFlowTableDependencies } from './dailyFlowTableDependencies.js';
import type { DailyFlowTableFiles } from './dailyFlowTableFiles.js';
import { readDailyFlowTable } from './dailyFlowTableRead.js';
import type { DbPort } from './dbPort.js';
import { upsertAppliedSyncObjectState } from './syncObjectApplyExecutor.js';

/** Enclosed in the existing authenticated object application transaction. */
export async function applyDailyFlowTable(db: DbPort, files: DailyFlowTableFiles, requestedId: string, hostName: string, sourceStateHash?: Uint8Array) {
  const table = await readDailyFlowTable(files, requestedId);
  if (sourceStateHash && bytesToHex(table.headers.get(requestedId)!.contentHash) !== bytesToHex(sourceStateHash)) {
    throw new Error('daily_flow_table_source_hash_invalid');
  }
  await assertDailyFlowTableDependencies(db, table);
  for (const fact of table.facts) {
    const header = table.headers.get(fact.id)!;
    const record = { object_type: 'daily_flow' as const, object_id: fact.id, payload_json: JSON.stringify(fact),
      content_hash: bytesToHex(header.contentHash), updated_at: fact.occurredAt, deleted_at: null };
    if (await dailyFlowFactApplyStatus(db, record) === 'apply') {
      await storeDailyFlowFact(db, fact);
      await upsertAppliedSyncObjectState(db, record);
    }
    if (fact.kind === 'create') await db.run('UPDATE daily_flow_lists SET complete=1,row_count=? WHERE list_id=?',
      [fact.rows.length, fact.id]);
  }
  const before = await readDailyFlowProjectionFacts(db);
  const related = await readRelatedDailyFlowFacts(db);
  const connected = new Set(connectedFlowFacts(related).map(fact => fact.id));
  const sameSet = table.applied.size === connected.size && [...connected].every(id => table.applied.has(id));
  if (table.session && sameSet) await installCurrentDailyFlowTable(db, table);
  else await projectDailyFlowSync(db);
  const after = await readDailyFlowProjectionFacts(db);
  if (after.length && (table.session && sameSet || JSON.stringify([...before].sort()) !== JSON.stringify([...after].sort()))) {
    await qualifyReceivedDailyFlow(db, hostName);
  }
  return { generatedChanges: false, workspaceScope: { kind: 'full' as const } };
}

async function installCurrentDailyFlowTable(db: DbPort, table: Awaited<ReturnType<typeof readDailyFlowTable>>) {
  const head = table.facts.find(fact => fact.id === table.begin.headId)!;
  const stored = await readDailyFlow(db);
  const scope = stored ? (JSON.parse(stored.settings_key) as { scope?: string }).scope ?? '' : '';
  await db.run('DELETE FROM daily_flow_entries');
  await insertCycleRows(db, table.members);
  await saveCycleFlow(db, { dayKey: head.settings.dayWindow.start, mode: stored?.mode ?? table.begin.mode,
    settingsKey: JSON.stringify({ ...head.settings, scope }), now: head.occurredAt, revision: (stored?.revision ?? 0) + 1,
    session: { ...table.session!, dayWindow: head.settings.dayWindow } });
  await db.run(`INSERT INTO daily_flow_sync_projection(id,root_id,head_id,merged) VALUES(1,?,?,?)
    ON CONFLICT(id) DO UPDATE SET root_id=excluded.root_id,head_id=excluded.head_id,merged=excluded.merged`,
  [head.rootId, head.id, mergeDailyFlowFacts([...table.facts], new Map())?.merged ? 1 : 0]);
  await replaceDailyFlowProjectionFacts(db, [...table.applied]);
}
