// @vitest-environment node
import { expect, it } from 'vitest';

import { nodeVersionChainMetadataSql } from '../../lib/core/sync/nodeVersionChainMetadata.js';
import { planNodeVersionChain, planNodeVersionMetadataChain, type ChainVersion, type ChainVersionMetadata } from '../../lib/core/sync/nodeVersionChainPlan.js';
import { chainMutationStatements, chainReferencesQuery } from '../../lib/core/sync/nodeVersionChainSql.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';

import { observeReads } from './syncNodeVerifiedTopicConflict.testSupport.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

it('preserves retention decisions with metadata flags in owned storage after obsolete cache removal without reading historical bodies', async () => {
  const host = textDevice();
  try {
    const base = textBranch('base', 'Original', undefined, '2026-10-07T00:00:00.000Z');
    const local = textBranch('local', '中😀'.repeat(100000), base);
    const remote = textBranch('remote', 'Concurrent', base);
    const retired = { ...base, version_id: 'retired', body_text: null,
      snapshot: { ...base.snapshot, content: null, body_blob_hash: null } };
    for (const record of [base, local, remote, retired]) await upsertRemoteVersion(host.db, record);
    const versions = await host.db.query<ChainVersion>('SELECT * FROM node_sync_versions WHERE object_id = ?', ['topic']);
    const edges = await host.db.query<{ version_id: string; parent_version_id: string; ordinal: number }>(
      'SELECT * FROM node_sync_version_parents');
    const expected = planNodeVersionChain(versions, edges, new Set(['local', 'remote']), new Set(), 100, new Set(['local']));
    const reads = observeReads(host.db);
    const continuous = await reads.port.query<ChainVersionMetadata>(nodeVersionChainMetadataSql(), ['topic']);
    expect(planNodeVersionMetadataChain(continuous, edges, new Set(['local', 'remote']), new Set(), 100, new Set(['local'])))
      .toEqual(expected);
    expect(reads.sizes).toEqual([]);
    host.sqlite.exec('DROP TABLE content_blob_data; DROP TABLE content_blobs');
    const stable = await reads.port.query<ChainVersionMetadata>(nodeVersionChainMetadataSql(), ['topic']);
    expect(planNodeVersionMetadataChain(stable, edges, new Set(['local', 'remote']), new Set(), 100, new Set(['local'])))
      .toEqual(expected);
    expect(reads.sizes).toEqual([]);
    host.sqlite.prepare("UPDATE node_sync_versions SET body_text = NULL, snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = 'local'").run();
    const unavailable = await reads.port.query<ChainVersionMetadata>(nodeVersionChainMetadataSql(), ['topic']);
    expect(planNodeVersionMetadataChain(unavailable, edges, new Set(['local', 'remote']), new Set(), 100, new Set(['local'])).skipped)
      .toBe('protected_body_unavailable');
  } finally { host.sqlite.close(); }
});

it('retires the same planned bodies while retaining current, frozen, held versions and parent identities', async () => {
  const old = textDevice();
  const stable = textDevice();
  try {
    const base = textBranch('base', 'Original');
    const held = textBranch('held', 'Held body', base);
    const head = textBranch('head', 'Current', held);
    for (const host of [old, stable]) for (const record of [base, held, head]) await upsertRemoteVersion(host.db, record);
    const versions = await old.db.query<ChainVersion>('SELECT * FROM node_sync_versions');
    const edges = await old.db.query<{ version_id: string; parent_version_id: string; ordinal: number }>(
      'SELECT * FROM node_sync_version_parents');
    const protectedIds = new Set(['held', 'head']);
    const plan = planNodeVersionChain(versions, edges, protectedIds, new Set(), 100, new Set(['head']));
    expect(plan.removed).toEqual(['base']);
    expect(planNodeVersionChain(versions, edges, protectedIds, new Set(['head']), 100).removed).toEqual([]);
    stable.sqlite.exec('DROP TABLE content_blob_data; DROP TABLE content_blobs');
    const metadata = await stable.db.query<ChainVersionMetadata>(nodeVersionChainMetadataSql(), ['topic']);
    expect(planNodeVersionMetadataChain(metadata, edges, protectedIds, new Set(), 100, new Set(['head']))).toEqual(plan);
    for (const statement of chainMutationStatements(plan)) await old.db.run(statement.sql, statement.params);
    for (const statement of chainMutationStatements(plan)) await stable.db.run(statement.sql, statement.params);
    const retired = await stable.db.query(`SELECT version_id, parent_version_id, body_text,
      json_extract(snapshot_json, '$.content') AS content, json_extract(snapshot_json, '$.body_blob_hash') AS snapshot_hash
      FROM node_sync_versions WHERE version_id = 'base'`);
    expect(retired).toEqual([{ version_id: 'base', parent_version_id: null, body_text: null,
      content: null, snapshot_hash: '88d759ea02cef4b82885c6c620473162757c75522805707c20e2be76a40a2825' }]);
    expect(await stable.db.query('SELECT * FROM node_sync_version_parents')).toEqual(edges);
    const after = await stable.db.query<ChainVersion>('SELECT * FROM node_sync_versions');
    expect(planNodeVersionChain(after, edges, protectedIds, new Set(), 100, new Set(['head'])).removed).toEqual([]);
    const afterMetadata = await stable.db.query<ChainVersionMetadata>(nodeVersionChainMetadataSql(), ['topic']);
    expect(planNodeVersionMetadataChain(afterMetadata, edges, protectedIds, new Set(), 100, new Set(['head'])).removed).toEqual([]);
    expect(await stable.db.query("SELECT version_id FROM node_sync_versions WHERE body_text IS NOT NULL ORDER BY version_id"))
      .toEqual([{ version_id: 'head' }, { version_id: 'held' }]);
    expect(await old.db.query('SELECT version_id FROM node_sync_versions WHERE body_text IS NOT NULL ORDER BY version_id'))
      .toEqual([{ version_id: 'head' }, { version_id: 'held' }]);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it('uses owned body availability for the legacy-history holder clause without reading full text', async () => {
  const host = textDevice();
  try {
    const base = textBranch('base', 'Original');
    const head = textBranch('head', 'Current', base);
    for (const record of [base, head]) await upsertRemoteVersion(host.db, record);
    host.sqlite.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
      INSERT INTO sync_group_local_state VALUES (1, 'group', 'local', 'active', 'now');
      INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
        device_name, platform, state, joined_at, updated_at)
      VALUES ('group', 'peer', 'anchor', '/peer', 'Peer', 'mac', 'active', 'now', 'now')`);
    const continuous = chainReferencesQuery('topic');
    const expected = await host.db.query(continuous.sql, continuous.params);
    host.sqlite.exec('DROP TABLE content_blob_data; DROP TABLE content_blobs');
    const chunked = chainReferencesQuery('topic', false, 'main');
    expect(chunked.params).toEqual(continuous.params);
    expect(await host.db.query(chunked.sql, chunked.params)).toEqual(expected);
    host.sqlite.prepare("UPDATE node_sync_versions SET body_text = NULL, snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = 'base'").run();
    expect(await host.db.query(chunked.sql, chunked.params)).toEqual([{ version_id: 'head', frozen: 0 }]);
    expect(chainReferencesQuery('topic', false, 'source').sql).toContain('FROM source.node_sync_versions version');
    const retiredLegacy = chainReferencesQuery('topic', true, 'main');
    expect(await host.db.query(retiredLegacy.sql, retiredLegacy.params)).toEqual([{ version_id: 'head', frozen: 0 }]);
  } finally { host.sqlite.close(); }
});
