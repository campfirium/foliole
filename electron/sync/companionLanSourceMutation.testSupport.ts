import type Database from 'better-sqlite3';

import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { encodeSyncPackFactClaims, probeSyncPackFactPresence,
  type SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import type { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';

import type { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';

type Server = Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>;
export type MutationFacts = SyncPackFactIndex | { source_view_id: string; index?: SyncPackFactIndex; ready?: boolean };
export interface RoundBoundary { frontier: number; epoch: string; }

export async function prepareMutationRoundPack(http: Server,
  port: ReturnType<typeof createBetterSqliteDbPort>, after: number, boundary?: RoundBoundary,
  initial?: MutationFacts) {
  const factsUrl = new URL('/companion/sync-pack-facts', http.origin);
  factsUrl.searchParams.set('page_contract', 'bounded-v1');
  factsUrl.searchParams.set('after_state_seq', String(after));
  if (boundary) {
    factsUrl.searchParams.set('frontier_state_seq', String(boundary.frontier));
    factsUrl.searchParams.set('source_epoch', boundary.epoch);
  }
  let response = initial ?? await http.getJson(factsUrl.pathname + factsUrl.search) as unknown as MutationFacts;
  const index = ('index' in response ? response.index : response) as SyncPackFactIndex;
  const window = { frontier: index.frontier_state_seq, epoch: index.source_epoch };
  const pack = new URL(factsUrl);
  pack.pathname = '/companion/sync-pack';
  pack.searchParams.set('frontier_state_seq', String(window.frontier));
  pack.searchParams.set('source_epoch', window.epoch);
  if ('source_view_id' in response) {
    const viewId = response.source_view_id;
    for (let page = 0; 'index' in response && response.index && page < 30; page++) {
      const fact = response.index;
      const bits = encodeSyncPackFactClaims(fact, await probeSyncPackFactPresence(port, fact));
      const next = new URL(pack);
      next.pathname = '/companion/sync-pack-facts';
      next.searchParams.set('fact_view', viewId);
      next.searchParams.set('fact_index_id', fact.index_id);
      next.searchParams.set('have_v', bits.versions);
      next.searchParams.set('have_p', bits.parents);
      next.searchParams.set('have_r', bits.reviews);
      response = await http.getJson(next.pathname + next.search) as unknown as MutationFacts;
    }
    if (!('ready' in response) || !response.ready) throw new Error('mutation_facts_incomplete');
    pack.searchParams.set('fact_view', viewId);
  } else {
    const bits = encodeSyncPackFactClaims(index, await probeSyncPackFactPresence(port, index));
    pack.searchParams.set('fact_index_id', index.index_id);
    if (index.round_source_view_id) pack.searchParams.set('round_source_view_id', index.round_source_view_id);
    pack.searchParams.set('have_v', bits.versions);
    pack.searchParams.set('have_p', bits.parents);
    pack.searchParams.set('have_r', bits.reviews);
  }
  return { url: pack, boundary: window };
}

export function mutateSourceDuringFrozenRound() {
  const source = openDatabaseConnection().sqlite;
  source.transaction(() => {
    for (const [seq, id, body, deleted] of [[41, 'live-1', 'edited-body', null],
      [42, 'live-2', 'body-2', 'later']] as const) {
      const parent = `version-${seq - 40}`;
      const version = `changed-${seq}`;
      source.prepare(`INSERT INTO node_sync_versions
        (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
        VALUES (?, ?, ?, 'source', 'later', ?, ?, ?)`).run(version, id, parent, version, body,
      JSON.stringify({ id, kind: 'topic', title: id, content: body, deleted_at: deleted }));
      source.prepare('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)').run(version, parent);
      source.prepare(`UPDATE nodes SET content=?, current_version_id=?, deleted_at=?, sync_dirty=0
        WHERE id=?`).run(body, version, deleted, id);
      source.prepare(`UPDATE sync_object_state SET state_seq=?, content_hash=?, deleted_at=?, sync_dirty=0
        WHERE object_type='node' AND object_id=?`).run(seq, version, deleted, id);
    }
    source.prepare('UPDATE sync_state_sequence SET high_water=42 WHERE singleton_id=1').run();
  })();
}

export function mutationReceiverRows(target: Database.Database) {
  return target.prepare(`SELECT id, current_version_id, ${buildNodeBodyContentSql('nodes')} AS content, deleted_at FROM nodes LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash ORDER BY id`).all();
}
