// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { textBranch, textDevice, wholeBodies } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach((device) => device.sqlite.close()));

async function legacyHost() {
  const host = textDevice();
  devices.push(host);
  const base = textBranch('base', 'Base');
  await host.receive([base, textBranch('main', 'Main complete text', base)]);
  const whole = await host.receive([textBranch('other', '\uFEFF其他\r\n😀\u0000end', base)]);
  const driver = createBetterSqlite3Driver(host.sqlite);
  for (const body of whole.alternative_bodies!) upsertTextBodyBlob(driver, body.text, whole.updated_at);
  host.sqlite.exec("UPDATE node_sync_versions SET snapshot_json = json_remove(snapshot_json, '$.text_alternative_bodies')");
  return { host, whole };
}

async function upgrade(host: ReturnType<typeof textDevice>, companion: boolean) {
  host.sqlite.pragma(`user_version = ${companion ? 78 : 149}`);
  if (companion) await host.db.transaction((tx) => migrateCompanionDatabase(tx, 78, 79));
  else initializeDatabaseSchema(host.sqlite);
}

it.each([false, true])('converts legacy alternative bodies once without changing identities through companion=%s', async (companion) => {
  const { host, whole } = await legacyHost();
  const edges = host.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all();
  await upgrade(host, companion);
  host.sqlite.exec('DELETE FROM content_blob_data');
  const current = await host.current();
  expect(wholeBodies(current)).toEqual(wholeBodies(whole));
  expect(current.version_id).toBe(whole.version_id);
  expect(current.content_hash).toBe(whole.content_hash);
  expect(current.snapshot.text_alternatives).toEqual(whole.snapshot.text_alternatives);
  expect(host.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all()).toEqual(edges);
  if (companion) await host.db.transaction((tx) => migrateCompanionDatabase(tx, 79, 79));
  else initializeDatabaseSchema(host.sqlite);
  expect(wholeBodies(await host.current())).toEqual(wholeBodies(whole));
});

it.each([false, true])('rolls back the upgrade and preserves legacy facts when a body is missing through companion=%s', async (companion) => {
  const { host, whole } = await legacyHost();
  const snapshots = host.sqlite.prepare('SELECT version_id, snapshot_json FROM node_sync_versions ORDER BY version_id').all();
  host.sqlite.prepare('DELETE FROM content_blob_data WHERE hash = ?').run(whole.alternative_bodies![0]!.hash);
  await expect(upgrade(host, companion)).rejects.toThrow('text_alternative_migration_body_unavailable');
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(companion ? 78 : 149);
  expect(host.sqlite.prepare('SELECT version_id, snapshot_json FROM node_sync_versions ORDER BY version_id').all()).toEqual(snapshots);
});
