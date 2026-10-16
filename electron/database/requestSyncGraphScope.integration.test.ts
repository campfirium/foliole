// @vitest-environment node
import { expect, it } from 'vitest';

import type { DbParams, DbRow } from '../../lib/core/sync/dbPort.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { framedSyncParentRelationFactId } from '../../lib/core/sync/framedSyncRelationReviewFact.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { readRequestSyncNodeGraph, requestSyncNodeSource } from '../../lib/core/sync/requestSyncNodeGraph.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { arraySyncNodeRecordSource } from '../../lib/core/sync/syncNodeRecordSource.js';

import { restoreFixture, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

const at = '2026-10-13T00:00:00.000Z';
async function lineage(peer: RestorePeer, count: number) {
  const base = textBranch('base', 'Original base', undefined, at);
  const branches = Array.from({ length: count }, (_, index) => textBranch(`branch-${index}`, `Body ${index}`, base, at));
  const merged = textBranch('merged', 'Original merged body', branches[0], at);
  merged.parent_version_ids = branches.map(record => record.version_id!);
  const records = [base, ...branches, merged];
  await peer.db.transaction(async tx => {
    for (const record of records) await upsertRemoteVersion(tx, record);
    await applySyncNodesWithDbPort(tx, [merged]);
  });
  return records;
}

async function snapshot(peer: RestorePeer) {
  const difference = compareFramedSyncInventories({ local: await readFramedSyncInventory(peer.db), remote: [] })
    .find(value => value.objectType === 'node' && value.globalId === 'topic');
  expect(difference).toBeDefined();
  return withRequestSyncFiles(peer.host.files, async files => {
    await writeRequestSyncSnapshot(peer.db, difference!, files);
    const facts = [];
    for await (const fact of files.readFacts()) facts.push(fact);
    return facts;
  });
}

function facts(peer: RestorePeer) {
  return ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'sync_object_state',
    'node_version_local_source_revisions'].map(table => peer.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

it.each([2, 300])('preserves every branch and parent edge in a %s-parent request snapshot', async count => {
  const fixture = await restoreFixture(); const source = fixture.peer('source');
  try {
    const records = await lineage(source, count);
    const before = facts(source);
    const graph = await readRequestSyncNodeGraph(source.db, 'topic');
    expect([...graph.ancestors('merged')].sort()).toEqual(['base', ...records.slice(1, -1).map(record => record.version_id!)].sort());
    expect(graph.parents.get('merged')).toEqual(records.slice(1, -1).map(record => record.version_id!));
    const outgoing = await snapshot(source);
    expect(outgoing.filter(fact => fact.kind === 2).map(fact => fact.factId).sort())
      .toEqual(records.map(record => record.version_id!).sort());
    const expectedEdges = records.slice(1, -1).flatMap((record, ordinal) => [
      { version_id: record.version_id!, parent_version_id: 'base', ordinal: 0 },
      { version_id: 'merged', parent_version_id: record.version_id!, ordinal }
    ]);
    expect(outgoing.filter(fact => fact.kind === 3).map(fact => fact.factId).sort())
      .toEqual(expectedEdges.map(framedSyncParentRelationFactId).sort());
    expect(outgoing.every(fact => fact.globalId === 'topic' && fact.objectType === 'node')).toBe(true);
    expect(facts(source)).toEqual(before);
  } finally { await fixture.close(); }
});

it('reads fewer than twenty rows for a small graph despite ten thousand unrelated retained versions', async () => {
  const fixture = await restoreFixture(); const source = fixture.peer('source');
  try {
    await lineage(source, 2);
    const insert = source.sqlite.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
      SELECT ?, 'unrelated', NULL, host_name, created_at, content_hash, body_text, snapshot_json
      FROM node_sync_versions WHERE version_id = 'base'`);
    source.sqlite.transaction(() => { for (let index = 0; index < 10_000; index++) insert.run(`unrelated-${index}`); })();
    const port = source.db;
    const query = port.query.bind(port);
    let returnedRows = 0;
    port.query = async <T extends DbRow>(sql: string, params?: DbParams) => {
      const rows = await query<T>(sql, params); returnedRows += rows.length; return rows;
    };
    const graph = await readRequestSyncNodeGraph(port, 'topic');
    expect([...graph.ancestors('merged')].sort()).toEqual(['base', 'branch-0', 'branch-1']);
    expect(graph.parents.size).toBe(4);
    expect(returnedRows).toBeGreaterThan(0);
    expect(returnedRows).toBeLessThan(20);
  } finally { await fixture.close(); }
});

it('rejects a missing current head before producing a complete snapshot without changing original facts', async () => {
  const fixture = await restoreFixture(); const source = fixture.peer('source');
  try {
    await lineage(source, 2);
    source.sqlite.prepare("DELETE FROM node_sync_versions WHERE version_id = 'merged'").run();
    expect(source.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get()).toBe('merged');
    const before = facts(source);
    await expect(snapshot(source)).rejects.toThrow(/request_sync_version_missing:merged|node_version_missing_parents:merged/);
    source.reopen();
    expect(facts(source)).toEqual(before);
  } finally { await fixture.close(); }
});

it('does not read any history for an empty incoming record set', async () => {
  const fixture = await restoreFixture(); const source = fixture.peer('source');
  try {
    await lineage(source, 2);
    const port = source.db;
    port.query = async () => { throw new Error('unexpected_history_read'); };
    const result = await requestSyncNodeSource(port, arraySyncNodeRecordSource([]));
    expect(result.records).toEqual([]);
  } finally { await fixture.close(); }
});
