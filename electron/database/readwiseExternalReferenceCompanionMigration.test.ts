// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const databases: Database.Database[] = [];
const roots: string[] = [];

afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true }));
});

function fixture() {
  fs.mkdirSync(path.resolve('.tmp/artifacts'), { recursive: true });
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/t178-5-companion-'));
  roots.push(root);
  const database = new Database(path.join(root, 'fixture.db'));
  databases.push(database);
  database.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  database.prepare('INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)')
    .run('device_id', 'fixture-device', '2026-09-07T00:00:00.000Z');
  database.exec('ALTER TABLE external_documents DROP COLUMN reference_json');
  database.exec('ALTER TABLE external_documents DROP COLUMN reference_kind');
  database.pragma('user_version = 35');
  return { database, port: createBetterSqliteDbPort(database) };
}

it('adds and rolls back the v36 remote External reference projection atomically', async () => {
  const success = fixture();
  await bootstrapCompanionDatabase(success.port, {
    allowCreate: false, expectedHostName: 'fixture-host', now: '2026-09-07T00:00:00.000Z'
  });
  expect(success.database.prepare(
    "SELECT name FROM pragma_table_info('external_documents') WHERE name IN ('reference_kind','reference_json') ORDER BY name"
  ).all()).toEqual([{ name: 'reference_json' }, { name: 'reference_kind' }]);

  const failure = fixture();
  await expect(bootstrapCompanionDatabase(failure.port, {
    allowCreate: false,
    beforeVersionCommit: () => { throw new Error('injected companion reference failure'); },
    expectedHostName: 'fixture-host',
    now: '2026-09-07T00:00:00.000Z'
  })).rejects.toThrow('injected companion reference failure');
  expect(failure.database.pragma('user_version', { simple: true })).toBe(35);
  expect(failure.database.prepare(
    "SELECT name FROM pragma_table_info('external_documents') WHERE name IN ('reference_kind','reference_json')"
  ).all()).toEqual([]);
});
