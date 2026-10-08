// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';

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

it.each([false, true])('preserves oversize history still used by an editor companion=%s', async (companion) => {
  const host = await fixture(true);
  await upgrade(host, companion);
  expect(host.sqlite.prepare("SELECT length(CAST(body_text AS BLOB)) AS bytes FROM node_sync_versions WHERE version_id='base'").get())
    .toEqual({ bytes: 1050000 });
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

it.each([false, true])('preserves an oversize version referenced by an unretired publication companion=%s', async (companion) => {
  const host = await fixture(false);
  host.sqlite.exec(`INSERT INTO framed_sync_outbound_publications VALUES
    (zeroblob(16), zeroblob(32), zeroblob(32), X'', '{"facts":[{"factId":"base","body":[]}]}',
      1, 'group', 'sender', 'epoch', 'receiver', 'epoch', 1, 0, 0, 'published');
    INSERT INTO framed_sync_outbound_fact_refs VALUES (zeroblob(16), 2, 'node', 'topic', 'base');
    INSERT INTO framed_sync_outbound_holds VALUES (zeroblob(16), 'receiver')`);
  const facts = host.sqlite.prepare('SELECT * FROM framed_sync_outbound_fact_refs').all();
  await upgrade(host, companion);
  expect(host.sqlite.prepare("SELECT length(CAST(body_text AS BLOB)) AS bytes FROM node_sync_versions WHERE version_id='base'").get())
    .toEqual({ bytes: 1050000 });
  expect(host.sqlite.prepare('SELECT * FROM framed_sync_outbound_fact_refs').all()).toEqual(facts);
});
