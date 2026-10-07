// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { nodeVersionChainMetadataSql } from '../../lib/core/sync/nodeVersionChainMetadata.js';
import { planNodeVersionChain, planNodeVersionMetadataChain, type ChainVersion, type ChainVersionMetadata } from '../../lib/core/sync/nodeVersionChainPlan.js';
import { chainMutationStatements, chainReferencesQuery } from '../../lib/core/sync/nodeVersionChainSql.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';

import { observeReads } from './syncNodeVerifiedTopicConflict.testSupport.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

it('preserves retention decisions with metadata flags in continuous and stable storage without reading historical bodies', async () => {
  const host = textDevice();
  try {
    const base = textBranch('base', 'Original', undefined, '2026-10-07T00:00:00.000Z');
    const local = textBranch('local', 'x'.repeat(3 * 1024 * 1024), base);
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
    await migrateBodyContentStorage(host.db);
    const stable = await reads.port.query<ChainVersionMetadata>(nodeVersionChainMetadataSql('chunked'), ['topic']);
    expect(planNodeVersionMetadataChain(stable, edges, new Set(['local', 'remote']), new Set(), 100, new Set(['local'])))
      .toEqual(expected);
    expect(reads.sizes).toEqual([]);
    host.sqlite.prepare("DELETE FROM content_bodies WHERE hash = (SELECT body_blob_hash FROM node_sync_versions WHERE version_id = 'local')").run();
    const unavailable = await reads.port.query<ChainVersionMetadata>(nodeVersionChainMetadataSql('chunked'), ['topic']);
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
    await migrateBodyContentStorage(stable.db);
    const metadata = await stable.db.query<ChainVersionMetadata>(nodeVersionChainMetadataSql('chunked'), ['topic']);
    expect(planNodeVersionMetadataChain(metadata, edges, protectedIds, new Set(), 100, new Set(['head']))).toEqual(plan);
    for (const statement of chainMutationStatements(plan)) await old.db.run(statement.sql, statement.params);
    for (const statement of chainMutationStatements(plan, 'chunked')) await stable.db.run(statement.sql, statement.params);
    const retired = await stable.db.query(`SELECT version_id, parent_version_id, body_text, body_state, body_blob_hash,
      json_extract(snapshot_json, '$.content') AS content, json_extract(snapshot_json, '$.body_blob_hash') AS snapshot_hash
      FROM node_sync_versions WHERE version_id = 'base'`);
    expect(retired).toEqual([{ version_id: 'base', parent_version_id: null, body_text: null,
      body_state: 'retired', body_blob_hash: null, content: null, snapshot_hash: null }]);
    expect(await stable.db.query('SELECT * FROM node_sync_version_parents')).toEqual(edges);
    expect(await stable.db.query("SELECT version_id FROM node_sync_versions WHERE body_state = 'readable' ORDER BY version_id"))
      .toEqual([{ version_id: 'head' }, { version_id: 'held' }]);
    expect(await old.db.query('SELECT version_id FROM node_sync_versions WHERE body_text IS NOT NULL ORDER BY version_id'))
      .toEqual([{ version_id: 'head' }, { version_id: 'held' }]);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it('uses verified chunked availability only for the legacy-history holder clause', async () => {
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
    await migrateBodyContentStorage(host.db);
    const chunked = chainReferencesQuery('topic', false, 'main', 'chunked');
    expect(chunked.params).toEqual(continuous.params);
    expect(await host.db.query(chunked.sql, chunked.params)).toEqual(expected);
    host.sqlite.prepare("DELETE FROM content_bodies WHERE hash = (SELECT body_blob_hash FROM node_sync_versions WHERE version_id = 'base')").run();
    expect(await host.db.query(chunked.sql, chunked.params)).toEqual([{ version_id: 'head', frozen: 0 }]);
    host.sqlite.exec(`INSERT INTO content_bodies (hash, byte_length, verified)
      SELECT body_blob_hash, 8, 0 FROM node_sync_versions WHERE version_id = 'base'`);
    expect(await host.db.query(chunked.sql, chunked.params)).toEqual([{ version_id: 'head', frozen: 0 }]);
    expect(chainReferencesQuery('topic', false, 'source', 'chunked').sql).toContain('FROM source.content_bodies body');
    const retiredLegacy = chainReferencesQuery('topic', true, 'main', 'chunked');
    expect(await host.db.query(retiredLegacy.sql, retiredLegacy.params)).toEqual([{ version_id: 'head', frozen: 0 }]);
  } finally { host.sqlite.close(); }
});
