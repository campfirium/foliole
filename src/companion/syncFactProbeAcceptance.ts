import { Capacitor, registerPlugin } from '@capacitor/core';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { stageSyncPackKnownFactClaims } from '../../lib/core/sync/syncPackKnownFactClaims.js';
import { createIsolatedCapacitorDatabaseManager } from '../shared/platform/capacitorSqliteDbPort.js';

import { assertIdentity, requireValue } from './capacityAcceptanceSafety.js';
import { runIsolatedKnownReadingPage } from './syncPageApplyAcceptance.js';

export const SYNC_FACT_PROBE_SCHEMA = [
  `CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT,
    parent_version_id TEXT, host_name TEXT, created_at TEXT, content_hash TEXT,
    body_text TEXT, snapshot_json TEXT)`,
  `CREATE TABLE node_sync_version_parents (version_id TEXT, parent_version_id TEXT,
    ordinal INTEGER, PRIMARY KEY (version_id, parent_version_id))`,
  `CREATE TABLE review_log (op_id TEXT PRIMARY KEY)`,
  `CREATE TABLE sync_pack_known_fact_claims (group_id TEXT NOT NULL, peer_id TEXT NOT NULL,
    source_view_id TEXT NOT NULL, kind TEXT NOT NULL, fact_key TEXT NOT NULL,
    fact_json TEXT NOT NULL,
    PRIMARY KEY (group_id, peer_id, source_view_id, kind, fact_key))`
];

function facts(count: number): SyncPackFactIndex {
  return {
    from_state_seq: 0, to_state_seq: count, frontier_state_seq: count,
    source_epoch: 'isolated-fact-probe', index_id: `isolated-${count}`,
    versions: Array.from({ length: count }, (_, index) => ({
      version_id: `version-${index}`, object_id: `node-${index}`,
      parent_version_id: null, host_name: 'source', created_at: '2026-10-03T00:00:00.000Z',
      content_hash: `hash-${index}`, body_hash: `body-${index}`,
      snapshot_metadata: JSON.stringify({ id: `node-${index}` })
    })), parents: [], reviews: []
  };
}

function countCalls(port: DbPort) {
  const calls = { queries: 0, runs: 0 };
  const wrap = (inner: DbPort): DbPort => ({
    async query<T extends Record<string, unknown>>(sql: string, params = []) {
      calls.queries++;
      return inner.query<T>(sql, params);
    },
    async run(sql, params) {
      calls.runs++;
      return inner.run(sql, params);
    },
    transaction(execute) { return inner.transaction((tx) => execute(wrap(tx))); }
  });
  return { calls, port: wrap(port) };
}

export async function measureEmptyFactPage(port: DbPort, count: number) {
  const measured = countCalls(port);
  const started = performance.now();
  const claims = await stageSyncPackKnownFactClaims(measured.port, {
    groupId: 'isolated-group', peerId: 'isolated-source', sourceViewId: `page-${count}`
  }, facts(count));
  const elapsedMs = performance.now() - started;
  requireValue(claims.versions.length === 0 && claims.parents.length === 0 &&
    claims.reviews.length === 0, 'An empty receiver claimed a source fact');
  const [staged] = await port.query<{ count: number }>(`SELECT COUNT(*) AS count
    FROM sync_pack_known_fact_claims WHERE source_view_id = ? AND kind <> 'progress'`,
  [`page-${count}`]);
  requireValue(staged?.count === 0, 'An empty receiver staged a source fact');
  return { facts: count, claimed: 0, queryCalls: measured.calls.queries,
    runCalls: measured.calls.runs, elapsedMs };
}

export async function runSyncFactProbeAcceptance() {
  const platform = Capacitor.getPlatform();
  const app = registerPlugin<{ getInfo(): Promise<{ id: string }> }>('App');
  const identity = await app.getInfo();
  assertIdentity(platform, identity.id);
  const name = `sync-fact-probe-${Date.now()}`;
  const sqlite = createIsolatedCapacitorDatabaseManager(platform);
  requireValue(await sqlite.exists(name) === false, 'Dedicated fact probe database already exists');
  const database = await sqlite.create(name);
  try {
    await database.open();
    for (const statement of SYNC_FACT_PROBE_SCHEMA) await database.port.run(statement);
    const [local] = await database.port.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM node_sync_versions');
    requireValue(local?.count === 0, 'Fact probe receiver is not empty');
    const results = [];
    for (const count of [32, 128]) results.push(await measureEmptyFactPage(database.port, count));
    const pageApply = await runIsolatedKnownReadingPage();
    return { status: 'passed', scenario: 'sync-fact-probe', appId: identity.id,
      platform, results, pageApply };
  } finally {
    await database.dispose();
  }
}

export function mountSyncFactProbeAcceptance(root: HTMLElement) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Run isolated sync fact probe';
  button.dataset.testid = 'sync-fact-probe-run';
  const result = document.createElement('textarea');
  result.readOnly = true;
  result.dataset.testid = 'sync-fact-probe-result';
  result.dataset.status = 'ready';
  root.replaceChildren(button, result);
  button.onclick = async () => {
    button.disabled = true;
    result.dataset.status = 'running';
    try { result.value = JSON.stringify(await runSyncFactProbeAcceptance()); }
    catch (error) { result.value = JSON.stringify({ status: 'failed', error: String(error) }); }
    result.setAttribute('data-result', result.value);
    result.dataset.status = JSON.parse(result.value).status;
  };
}
