// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import { LATEST_NUMBERED_SCHEMA_MIGRATIONS } from '../../lib/core/database/numberedMigrationLatestRegistry.js';
import * as bodyHash from '../../lib/core/database/textBodyHash.js';
import { buildRemoteNodeVersionUpsert } from '../../lib/core/sync/syncNodeApplyStatements.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { readTopicTextSnapshot } from '../../lib/core/sync/topicTextBodies.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => { vi.restoreAllMocks(); devices.splice(0).forEach((host) => host.sqlite.close()); });
const main = 'Main original body';
const alternative = '\uFEFF其他\r\n😀\u0000end'.repeat(1000);
const expired = 'Expired text';

async function legacyHost() {
  const host = textDevice(); devices.push(host);
  await host.receive([textBranch('base', main)]);
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) host.sqlite.exec(sql);
  const now = new Date().toISOString();
  const insert = host.sqlite.prepare(`INSERT INTO node_text_alternatives VALUES
    (?, 'topic', ? || '-version', ?, ?, ?, 'available', ?)`);
  insert.run('retained', 'retained', alternative, 'original-host', now, now);
  insert.run('duplicate', 'duplicate', alternative, 'later-host', now, new Date(Date.now() + 1000).toISOString());
  insert.run('main-copy', 'main-copy', main, 'main-host', now, now);
  insert.run('expired', 'expired', expired, 'old-host', '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z');
  return host;
}

async function upgrade(host: Pick<ReturnType<typeof textDevice>, 'sqlite' | 'db'>, companion: boolean) {
  if (companion) await host.db.transaction((tx) => migrateCompanionDatabase(tx, 75, 76));
  else host.sqlite.transaction(() => LATEST_NUMBERED_SCHEMA_MIGRATIONS.find((entry) => entry.version === 147)!.migrate(host.sqlite))();
}

it.each([false, true])('reuses prepared body digests while preserving stored-body validation, companion=%s', async (companion) => {
  const host = await legacyHost();
  const original = host.sqlite.prepare('SELECT created_at, updated_at FROM node_text_alternatives WHERE alternative_id = ?')
    .get('retained') as { created_at: string; updated_at: string };
  const digest = vi.spyOn(bodyHash, 'hashTextBody');
  await upgrade(host, companion);
  // Preparation supplies the exact-text digest to every later consumer.
  expect(digest.mock.calls.filter(([text]) => text === alternative)).toHaveLength(1);
  expect(digest.mock.calls.filter(([text]) => text === expired)).toHaveLength(1);
  expect(digest.mock.calls.filter(([text]) => text === main)).toHaveLength(1);
  digest.mockRestore();
  const current = await host.current();
  expect(current.body_text).toBe(main);
  expect(current.parent_version_ids).toEqual(['base']);
  expect(current.ancestor_version_ids).toContain('base');
  expect(current.snapshot.text_selection?.version_id).toBe('base');
  expect(current.snapshot.text_alternatives).toHaveLength(1);
  expect(current.snapshot.text_alternatives![0]).toMatchObject({ source_host_name: 'original-host',
    created_at: original.created_at, expires_at: new Date(Date.parse(original.updated_at) + 30 * 86400000).toISOString() });
  expect(current.alternative_bodies).toEqual([{ hash: bodyHash.hashTextBody(alternative), text: alternative }]);
  expect(host.sqlite.prepare('SELECT data FROM content_blob_data WHERE hash = ?').get(bodyHash.hashTextBody(alternative)))
    .toEqual({ data: Buffer.from(alternative) });
  expect(host.sqlite.prepare('SELECT available FROM framed_sync_resource_availability WHERE hash = ?')
    .get(bodyHash.hashTextBody(alternative))).toEqual({ available: 1 });
  expect(host.sqlite.prepare("SELECT COUNT(*) AS count FROM node_text_alternatives WHERE body_text != '' OR status != 'superseded'")
    .get()).toEqual({ count: 0 });
  expect(() => buildRemoteNodeVersionUpsert({ ...current,
    alternative_bodies: [{ ...current.alternative_bodies![0]!, text: 'Mismatched payload' }]
  })).toThrow('text_alternative_body_hash_mismatch');
});


it.each([false, true])('rolls back partial blob writes and retries after reopening an isolated database, companion=%s', async (companion) => {
  const source = await legacyHost();
  const artifactRoot = path.resolve('.tmp/artifacts/topic-text-migration');
  mkdirSync(artifactRoot, { recursive: true });
  const directory = mkdtempSync(path.join(artifactRoot, 'reopen-'));
  const filename = path.join(directory, 'migration.db');
  await source.sqlite.backup(filename);
  let sqlite = new Database(filename);
  try {
    sqlite.pragma(`user_version = ${companion ? 75 : 146}`);
    const original = sqlite.prepare('SELECT * FROM node_text_alternatives ORDER BY alternative_id').all();
    const versions = sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
    const blobCount = sqlite.prepare('SELECT COUNT(*) FROM content_blob_data').pluck().get();
    sqlite.exec(`CREATE TRIGGER fail_successor BEFORE INSERT ON node_sync_versions
      WHEN NEW.version_id != 'base' BEGIN SELECT RAISE(ABORT, 'migration_write_failure'); END`);
    await expect(upgrade({ sqlite, db: createBetterSqliteDbPort(sqlite) }, companion)).rejects.toThrow('migration_write_failure');
    expect(sqlite.prepare('SELECT * FROM node_text_alternatives ORDER BY alternative_id').all()).toEqual(original);
    expect(sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
    expect(sqlite.prepare('SELECT COUNT(*) FROM content_blob_data').pluck().get()).toBe(blobCount);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(companion ? 75 : 146);
    sqlite.close(); sqlite = new Database(filename);
    sqlite.exec('DROP TRIGGER fail_successor');
    await upgrade({ sqlite, db: createBetterSqliteDbPort(sqlite) }, companion);
    sqlite.close(); sqlite = new Database(filename);
    const current = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(sqlite), 'topic');
    expect(current?.body_text).toBe(main);
    expect(current?.alternative_bodies).toEqual([{ hash: bodyHash.hashTextBody(alternative), text: alternative }]);
    expect(current?.parent_version_ids).toEqual(['base']);
    const versionId = current!.version_id;
    await upgrade({ sqlite, db: createBetterSqliteDbPort(sqlite) }, companion);
    expect((await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(sqlite), 'topic'))?.version_id).toBe(versionId);
  } finally {
    sqlite.close(); rmSync(directory, { recursive: true, force: true });
  }
});


it.each([false, true])('keeps the newest three alternatives and leaves unrelated nodes unchanged, companion=%s', async (companion) => {
  const host = await legacyHost();
  await host.receive([{
    ...textBranch('unrelated-base', 'Unrelated body'), object_id: 'unrelated',
    snapshot: { ...textBranch('unrelated-base', 'Unrelated body').snapshot, id: 'unrelated' }
  }]);
  const unrelated = host.sqlite.prepare("SELECT * FROM node_sync_versions WHERE object_id = 'unrelated'").all();
  const insert = host.sqlite.prepare(`INSERT INTO node_text_alternatives VALUES
    (?, 'topic', ?, ?, ?, ?, 'available', ?)`);
  const now = new Date().toISOString();
  for (let index = 0; index < 4; index += 1) {
    const date = new Date(Date.now() + (index + 1) * 1000).toISOString();
    insert.run(`extra-${index}`, `extra-source-${index}`, `Extra text ${index}`, `Extra host ${index}`, date, now);
  }
  await upgrade(host, companion);
  const current = await host.current();
  expect(current.alternative_bodies?.map((body) => body.text)).toEqual(['Extra text 3', 'Extra text 2', 'Extra text 1']);
  expect(host.sqlite.prepare("SELECT * FROM node_sync_versions WHERE object_id = 'unrelated'").all()).toEqual(unrelated);
});


function recordWithAlternative(body: string) {
  const record = textBranch('prepared-main', body);
  const hash = bodyHash.hashTextBody(alternative);
  record.snapshot.text_alternatives = [{ id: 'prepared-alternative', body_blob_hash: hash,
    source_host_name: 'peer', created_at: '2026-10-29T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z' }];
  record.alternative_bodies = [{ hash, text: alternative }];
  return record;
}

it.each(['', '\uFEFF正文\r\n😀\u0000\ud800'])('writes identical versions using prepared main and alternative digests: %j', (body) => {
  const record = recordWithAlternative(body);
  const expected = buildRemoteNodeVersionUpsert(record);
  const prepared = new Map([[body, bodyHash.hashTextBody(body)], [alternative, bodyHash.hashTextBody(alternative)]]);
  const digest = vi.spyOn(bodyHash, 'hashTextBody');
  expect(buildRemoteNodeVersionUpsert(record, prepared)).toEqual(expected);
  expect(digest).not.toHaveBeenCalled();
  digest.mockRestore();
  expect(readTopicTextSnapshot(String(expected!.params[7])).bodies).toEqual(record.alternative_bodies);
});

it('rejects mismatched or missing prepared text and still validates independently loaded payloads', () => {
  const record = recordWithAlternative(main);
  const prepared = new Map([[main, bodyHash.hashTextBody(main)], [alternative, bodyHash.hashTextBody(alternative)]]);
  const changed = { ...record, alternative_bodies: [{ ...record.alternative_bodies![0]!, text: 'Changed after preparation' }] };
  expect(() => buildRemoteNodeVersionUpsert(changed, prepared)).toThrow('text_alternative_body_hash_mismatch');
  expect(() => buildRemoteNodeVersionUpsert(changed)).toThrow('text_alternative_body_hash_mismatch');
  expect(() => buildRemoteNodeVersionUpsert(record, new Map([[main, prepared.get(main)!]])))
    .toThrow('text_alternative_body_hash_mismatch');
  expect(() => buildRemoteNodeVersionUpsert(record, new Map([[alternative, prepared.get(alternative)!]])))
    .toThrow('text_body_hash_unprepared');
  const statement = buildRemoteNodeVersionUpsert(record, prepared)!;
  const snapshot = JSON.parse(String(statement.params[7]));
  snapshot.text_alternative_bodies[0].text = 'Stored bytes were changed';
  expect(() => readTopicTextSnapshot(JSON.stringify(snapshot))).toThrow('text_alternative_body_hash_mismatch');
});

it('keeps released versions unchanged without requiring prepared bytes', () => {
  const record = recordWithAlternative(main);
  record.body_text = null; record.snapshot.content = null;
  expect(buildRemoteNodeVersionUpsert(record, new Map())).toEqual(buildRemoteNodeVersionUpsert(record));
});
