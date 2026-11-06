// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionIndependentTopicAlternatives } from '../../lib/core/database/independentTopicAlternativesMigration.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { loadTopicTextBodiesWithDriver } from '../../lib/core/database/topicTextBodiesWithDriver.js';
import { loadTopicTextStateWithDriver } from '../../lib/core/database/topicTextStateWithDriver.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const hosts: ReturnType<typeof textDevice>[] = [];
afterEach(() => hosts.splice(0).forEach(host => host.sqlite.close()));

async function legacyOwner(corrupt = false) {
  const host = textDevice(); hosts.push(host);
  const base = textBranch('legacy', 'Main article');
  const hash = hashTextBody('Alternative article');
  const createdAt = new Date(Date.now() - 60_000).toISOString();
  const expiresAt = new Date(Date.now() + 10 * 86400000).toISOString();
  base.snapshot.text_alternatives = [{ id: 'legacy-choice', body_blob_hash: hash,
    source_host_name: 'other-device', created_at: createdAt, expires_at: expiresAt }];
  base.alternative_bodies = [{ hash, text: 'Alternative article' }];
  await host.receive([base]);
  if (corrupt) host.sqlite.prepare(`UPDATE node_sync_versions SET snapshot_json =
    json_set(snapshot_json, '$.text_alternative_bodies[0].text', 'Corrupt') WHERE version_id='legacy'`).run();
  for (const name of ['body_blob_hash', 'expires_at', 'resource_references', 'image_sources']) {
    host.sqlite.exec(`ALTER TABLE node_text_alternatives DROP COLUMN ${name}`);
  }
  host.sqlite.exec(`CREATE UNIQUE INDEX idx_node_text_alternatives_source_version ON node_text_alternatives(node_id, source_version_id);
    CREATE UNIQUE INDEX idx_node_text_alternatives_available_source ON node_text_alternatives(node_id, source_host_name) WHERE status='available'`);
  host.sqlite.pragma('user_version = 184');
  return { host, original: host.sqlite.prepare("SELECT snapshot_json FROM node_sync_versions WHERE version_id='legacy'").pluck().get(),
    createdAt, expiresAt };
}

it('moves valid current choices without rewriting old facts or renewing their lifetime', async () => {
  const { host, original, createdAt, expiresAt } = await legacyOwner();
  initializeDatabaseSchema(host.sqlite);
  const driver = createBetterSqlite3Driver(host.sqlite);
  const [entry] = loadTopicTextStateWithDriver(driver, 'topic');
  expect(entry).toMatchObject({ id: 'legacy-choice', created_at: createdAt, expires_at: expiresAt });
  expect(loadTopicTextBodiesWithDriver(driver, 'topic', [entry!])[0]?.text).toBe('Alternative article');
  expect((await host.current()).body_text).toBe('Main article');
  expect((await host.current()).snapshot.text_alternatives ?? []).toEqual([]);
  expect(host.sqlite.prepare("SELECT snapshot_json FROM node_sync_versions WHERE version_id='legacy'").pluck().get()).toBe(original);
  const count = host.sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions').pluck().get();
  initializeDatabaseSchema(host.sqlite);
  expect(host.sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions').pluck().get()).toBe(count);
});

it('rolls back migration and version advancement when a required choice body is corrupt', async () => {
  const { host, original } = await legacyOwner(true);
  expect(() => initializeDatabaseSchema(host.sqlite)).toThrow('text_alternative_body_hash_mismatch');
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(184);
  expect(host.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id='topic'").pluck().get()).toBe('legacy');
  expect(host.sqlite.prepare("SELECT snapshot_json FROM node_sync_versions WHERE version_id='legacy'").pluck().get()).toBe(original);
  expect(host.sqlite.prepare("SELECT COUNT(*) FROM node_text_alternatives WHERE status='available'").pluck().get()).toBe(0);
});

it('uses the same migration through the companion database port', async () => {
  const { host, expiresAt } = await legacyOwner();
  await host.db.transaction(tx => migrateCompanionIndependentTopicAlternatives(tx));
  const [entry] = loadTopicTextStateWithDriver(createBetterSqlite3Driver(host.sqlite), 'topic');
  expect(entry?.expires_at).toBe(expiresAt);
  expect((await host.current()).snapshot.text_alternatives ?? []).toEqual([]);
});

it('keeps the existing three-choice bound across multiple live legacy owners', async () => {
  const { host } = await legacyOwner();
  const current = await host.current();
  for (const [index, body] of ['First', 'Second', 'Third', 'Fourth'].entries()) {
    const branch = textBranch(`live-${index}`, `Main branch ${index}`, undefined);
    const hash = hashTextBody(body);
    branch.snapshot.text_alternatives = [{ id: `choice-${index}`, body_blob_hash: hash,
      source_host_name: 'same-device', created_at: new Date(Date.now() + index * 1000).toISOString(),
      expires_at: new Date(Date.now() + 20 * 86400000).toISOString() }];
    branch.alternative_bodies = [{ hash, text: body }];
    await upsertRemoteVersion(host.db, branch);
  }
  initializeDatabaseSchema(host.sqlite);
  expect((await host.alternatives()).map(entry => entry.id).sort()).toEqual(['choice-1', 'choice-2', 'choice-3']);
  expect((await host.current()).body_text).toBe(current.body_text);
  expect(host.sqlite.prepare("SELECT COUNT(*) FROM node_text_alternatives WHERE status='superseded' AND body_text=''").pluck().get()).toBe(2);
});
