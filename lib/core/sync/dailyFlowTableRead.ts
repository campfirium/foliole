import { bytesToHex } from '@noble/hashes/utils.js';

import { cycleRowSchema, type CycleRow } from '../flow/cycleFlowTypes.js';
import { dailyFlowFactHash } from '../flow/dailyFlowFactHash.js';
import { joinDailyFlowRows, type DailyFlowFactRow } from '../flow/dailyFlowFactRowCodec.js';
import { dailyFlowSessionSchema } from '../flow/dailyFlowSessionSchema.js';
import { connectedFlowFacts } from '../flow/dailyFlowSyncMerge.js';

import { storedDailyFlowRow, type DailyFlowTableRecord } from './dailyFlowTableContract.js';
import type { DailyFlowTableFiles } from './dailyFlowTableFiles.js';

export async function readDailyFlowTable(files: DailyFlowTableFiles, requestedId: string) {
  const begin = files.begin;
  if (!begin || !files.complete || begin.requestedFactId !== requestedId) throw new Error('daily_flow_table_identity_invalid');
  const headers = new Map<string, NonNullable<DailyFlowTableRecord['fact']>>();
  const rows = new Map<string, DailyFlowFactRow[]>();
  const members: Record<'current' | 'before' | 'after', CycleRow[]> = { current: [], before: [], after: [] };
  const applied = new Set<string>();
  const dependencies: NonNullable<DailyFlowTableRecord['dependency']>[] = [];
  for await (const record of files.records()) {
    if (record.fact) {
      if (headers.has(record.fact.factId)) throw new Error('daily_flow_table_fact_duplicate');
      headers.set(record.fact.factId, record.fact);
    } else if (record.row) {
      if (!headers.has(record.row.factId)) throw new Error('daily_flow_table_fact_missing');
      const values = rows.get(record.row.factId) ?? [];
      values.push(storedDailyFlowRow(record.row)); rows.set(record.row.factId, values);
    } else if (record.member) readMember(record.member, members);
    else if (record.appliedFactId) {
      if (applied.has(record.appliedFactId)) throw new Error('daily_flow_table_applied_duplicate');
      applied.add(record.appliedFactId);
    } else if (record.dependency) dependencies.push(record.dependency);
  }
  const facts = [...headers.values()].map(header => {
    const fact = joinDailyFlowRows(header.payloadJson, rows.get(header.factId) ?? []);
    if (fact.id !== header.factId || dailyFlowFactHash(fact) !== bytesToHex(header.contentHash)) {
      throw new Error('daily_flow_table_fact_hash_invalid');
    }
    if (begin.purpose !== 'current_table' && fact.rootId !== begin.listId) throw new Error('daily_flow_table_root_invalid');
    if (begin.purpose === 'operation' && fact.id !== requestedId) throw new Error('daily_flow_table_operation_invalid');
    return fact;
  });
  const requested = facts.find(fact => fact.id === requestedId);
  if (facts.length !== begin.factCount || members.current.length !== begin.memberCount) throw new Error('daily_flow_table_count_invalid');
  if (!requested || requested.rootId !== begin.listId) throw new Error('daily_flow_table_requested_fact_missing');
  if (begin.purpose === 'operation' && requested.kind === 'create') throw new Error('daily_flow_table_operation_invalid');
  if (begin.purpose !== 'operation' && requested.kind !== 'create') throw new Error('daily_flow_table_root_invalid');
  const connected = new Set(connectedFlowFacts([...facts]).map(fact => fact.id));
  if ([...applied].some(id => !connected.has(id))) throw new Error('daily_flow_table_applied_invalid');
  const session = begin.purpose === 'current_table' ? dailyFlowSessionSchema.parse(JSON.parse(begin.sessionJson)) : null;
  if (session) {
    if (!applied.has(begin.headId) || facts.find(fact => fact.id === begin.headId)?.rootId !== begin.listId) {
      throw new Error('daily_flow_table_head_invalid');
    }
    if (session.cycle?.change) {
      session.cycle.change.before = members.before; session.cycle.change.after = members.after;
    } else if (members.before.length || members.after.length) throw new Error('daily_flow_table_session_invalid');
  } else if (members.current.length || applied.size || begin.headId || begin.sessionJson || dependencies.length) {
    throw new Error('daily_flow_table_history_has_projection');
  }
  return { begin, headers, facts, applied, members: members.current, session, dependencies };
}

function readMember(member: NonNullable<DailyFlowTableRecord['member']>, groups: Record<'current' | 'before' | 'after', CycleRow[]>) {
  const values = groups[member.slot];
  if (member.ordinal !== values.length) throw new Error('daily_flow_table_member_sequence_invalid');
  const row = cycleRowSchema.parse({ node_id: member.nodeId, order_key: member.orderKey, active: member.active,
    cohort: member.cohort, handled: member.handled, initial_task: member.initialTask });
  if (member.slot === 'current' && values.length && row.order_key <= values.at(-1)!.order_key) {
    throw new Error('daily_flow_table_member_order_invalid');
  }
  values.push(row);
}
