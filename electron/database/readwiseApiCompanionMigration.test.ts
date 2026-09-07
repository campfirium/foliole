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
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/t178-4-companion-'));
  roots.push(root);
  const database = new Database(path.join(root, 'fixture.db'));
  databases.push(database);
  database.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  database.prepare('INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)')
    .run('device_id', 'fixture-device', '2026-09-07T00:00:00.000Z');
  database.exec('ALTER TABLE import_sources DROP COLUMN remote_import_state_json');
  database.pragma('user_version = 34');
  return { database, port: createBetterSqliteDbPort(database) };
}

function bootstrap(port: ReturnType<typeof createBetterSqliteDbPort>, beforeVersionCommit?: () => void) {
  return bootstrapCompanionDatabase(port, {
    allowCreate: false,
    ...(beforeVersionCommit ? { beforeVersionCommit } : {}),
    expectedHostName: 'fixture-host',
    now: '2026-09-07T00:00:00.000Z'
  });
}

it('adds and rolls back the v35 Readwise materialization projection atomically', async () => {
  const success = fixture();
  await bootstrap(success.port);
  expect(success.database.prepare(
    "SELECT name FROM pragma_table_info('import_sources') WHERE name='remote_import_state_json'"
  ).get()).toEqual({ name: 'remote_import_state_json' });

  const failure = fixture();
  await expect(bootstrap(failure.port, () => {
    throw new Error('injected materialization projection failure');
  })).rejects.toThrow('injected materialization projection failure');
  expect(failure.database.pragma('user_version', { simple: true })).toBe(34);
  expect(failure.database.prepare(
    "SELECT name FROM pragma_table_info('import_sources') WHERE name='remote_import_state_json'"
  ).get()).toBeUndefined();
});
