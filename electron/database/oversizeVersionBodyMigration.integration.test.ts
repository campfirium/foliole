// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { canonicalContentId, type CanonicalBlob, type CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectFramedSyncNodeIdentityFact, projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { isNodeVersionIdentityOnly } from '../../lib/core/sync/syncNodeVersionHistory.js';
import { streamRetainedNodeVersions } from '../../lib/core/sync/syncNodeVersionSelection.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach((device) => device.sqlite.close()));

async function fixture(held: boolean) {
  const host = textDevice();
  devices.push(host);
  const base = textBranch('base', 'Old text');
  const small = textBranch('small', 'Small historical text', base);
  await host.receive([base, small, textBranch('head', 'Current text', small)]);
  host.sqlite.prepare(`UPDATE node_sync_versions SET body_text = ?,
    snapshot_json = json_set(snapshot_json, '$.content', ?) WHERE version_id = 'base'`)
    .run('雪'.repeat(350000), '雪'.repeat(350000));
  host.sqlite.prepare(`UPDATE node_sync_versions SET body_text = ?,
    snapshot_json = json_set(snapshot_json, '$.content', ?) WHERE version_id = 'small'`)
    .run(small.body_text, small.body_text);
  if (held) host.sqlite.exec(`INSERT INTO node_version_local_holds VALUES ('editor', 'topic', 'base', 'now')`);
  return host;
}

async function upgrade(host: ReturnType<typeof textDevice>, companion: boolean) {
  host.sqlite.pragma(`user_version = ${companion ? 78 : 149}`);
  if (companion) await host.db.transaction((tx) => migrateCompanionDatabase(tx, 78, 79));
  else initializeDatabaseSchema(host.sqlite);
}

it.each([false, true])('retires only replaceable oversize historical text and preserves facts companion=%s', async (companion) => {
  const host = await fixture(false);
  const identities = host.sqlite.prepare(`SELECT version_id, object_id, content_hash, host_name,
    parent_version_id, created_at FROM node_sync_versions ORDER BY version_id`).all();
  const edges = host.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all();
  await upgrade(host, companion);
  expect(host.sqlite.prepare("SELECT body_text IS NULL AS retired FROM node_sync_versions WHERE version_id='base'").get())
    .toEqual({ retired: 1 });
  expect(host.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id='small'").get())
    .toEqual({ body_text: 'Small historical text' });
  expect(host.sqlite.prepare(`SELECT version_id, object_id, content_hash, host_name,
    parent_version_id, created_at FROM node_sync_versions ORDER BY version_id`).all()).toEqual(identities);
  expect(host.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all()).toEqual(edges);
  expect((await host.current()).body_text).toBe('Current text');
});

it.each([false, true])('retires oversize history while preserving editor basis identity companion=%s', async (companion) => {
  const host = await fixture(true);
  await upgrade(host, companion);
  expect(host.sqlite.prepare("SELECT length(CAST(body_text AS BLOB)) AS bytes FROM node_sync_versions WHERE version_id='base'").get())
    .toEqual({ bytes: null });
  expect(host.sqlite.prepare('SELECT version_id FROM node_version_local_holds').all()).toEqual([{ version_id: 'base' }]);
});

it.each([false, true])('retires an oversize owned alternative with its replaceable version companion=%s', async (companion) => {
  const host = await fixture(false);
  const text = '雪'.repeat(350000);
  const hash = hashTextBody(text);
  const alternative = { id: 'choice', body_blob_hash: hash, source_host_name: 'peer',
    created_at: '2026-10-07T00:00:00.000Z', expires_at: '2100-01-01T00:00:00.000Z' };
  host.sqlite.prepare(`UPDATE node_sync_versions SET body_text = 'Small main body',
    snapshot_json = json_set(snapshot_json, '$.content', 'Small main body',
      '$.text_alternatives', json(?), '$.text_alternative_bodies', json(?)) WHERE version_id = 'base'`)
    .run(JSON.stringify([alternative]), JSON.stringify([{ hash, text }]));
  await upgrade(host, companion);
  const row = host.sqlite.prepare(`SELECT body_text, json_type(snapshot_json, '$.text_alternative_bodies') AS payload,
    json_extract(snapshot_json, '$.text_alternatives') AS alternatives FROM node_sync_versions WHERE version_id = 'base'`).get();
  expect(row).toEqual({ body_text: null, payload: null, alternatives: JSON.stringify([alternative]) });
});

it.each([false, true])('retires oversize history while preserving publication fact references companion=%s', async (companion) => {
  const host = await fixture(false);
  host.sqlite.exec(`INSERT INTO framed_sync_outbound_publications VALUES
    (zeroblob(16), zeroblob(32), zeroblob(32), X'', '{"facts":[{"factId":"base","body":[]}]}',
      1, 'group', 'sender', 'epoch', 'receiver', 'epoch', 1, 0, 0, 'published');
    INSERT INTO framed_sync_outbound_fact_refs VALUES (zeroblob(16), 2, 'node', 'topic', 'base');
    INSERT INTO framed_sync_outbound_holds VALUES (zeroblob(16), 'receiver')`);
  const facts = host.sqlite.prepare('SELECT * FROM framed_sync_outbound_fact_refs').all();
  await upgrade(host, companion);
  expect(host.sqlite.prepare("SELECT length(CAST(body_text AS BLOB)) AS bytes FROM node_sync_versions WHERE version_id='base'").get())
    .toEqual({ bytes: null });
  expect(host.sqlite.prepare('SELECT * FROM framed_sync_outbound_fact_refs').all()).toEqual(facts);
});

function addNewMember(host: ReturnType<typeof textDevice>) {
  host.sqlite.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'local', 'active', 'now');
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', 'new-peer', 'peer-anchor', '/peer', 'peer', 'ios', 'active', 'now', 'now')`);
}

it.each([false, true])('retires only oversize history despite a new member without a base companion=%s', async (companion) => {
  const host = await fixture(false);
  addNewMember(host);
  await upgrade(host, companion);
  expect(host.sqlite.prepare("SELECT body_text IS NULL AS retired FROM node_sync_versions WHERE version_id='base'").get())
    .toEqual({ retired: 1 });
  expect(host.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id='small'").get())
    .toEqual({ body_text: 'Small historical text' });
});

it('publishes previously protected oversize history as identity after the current head becomes ready', async () => {
  const host = await fixture(false);
  addNewMember(host);
  const identities = host.sqlite.prepare('SELECT version_id, parent_version_id, content_hash FROM node_sync_versions ORDER BY version_id').all();
  const facts: CanonicalFact[] = [];
  const blobs: CanonicalBlob[] = [];
  await host.db.transaction(async (tx) => {
    for await (const record of streamRetainedNodeVersions(tx, ['head', 'small', 'base'], 'topic')) {
      const projection = isNodeVersionIdentityOnly(record)
        ? { facts: [projectFramedSyncNodeIdentityFact(record)], blobs: [] }
        : projectFramedSyncNodeRecord(record).manifest;
      facts.push(...projection.facts);
      blobs.push(...projection.blobs);
    }
  });
  await expect(canonicalContentId({ facts, blobs })).resolves.toHaveLength(32);
  expect(facts.find((fact) => fact.factId === 'base')?.blobs).toEqual([]);
  expect(host.sqlite.prepare('SELECT version_id, parent_version_id, content_hash FROM node_sync_versions ORDER BY version_id').all()).toEqual(identities);
  expect((await host.current()).body_text).toBe('Current text');
});

it('keeps editor basis identity while selecting retired oversize history for a new member', async () => {
  const host = await fixture(true);
  addNewMember(host);
  await host.db.transaction(async (tx) => {
    for await (const record of streamRetainedNodeVersions(tx, ['base'], 'topic')) {
      expect(isNodeVersionIdentityOnly(record)).toBe(true);
    }
  });
  expect(host.sqlite.prepare("SELECT length(CAST(body_text AS BLOB)) AS bytes FROM node_sync_versions WHERE version_id='base'").get())
    .toEqual({ bytes: null });
  expect(host.sqlite.prepare('SELECT version_id FROM node_version_local_holds').all()).toEqual([{ version_id: 'base' }]);
});
