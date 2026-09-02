import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function emptyDatabase() {
  const base = path.resolve('.tmp/artifacts');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'companion-fresh-initialization-'));
  roots.push(root);
  const sqlite = new Database(path.join(root, 'fixture.db'));
  return { port: createBetterSqliteDbPort(sqlite), sqlite };
}

describe('fresh companion workspace initialization', () => {
  it('creates the Inbox needed for local capture before joining a Sync Group', async () => {
    const fixture = emptyDatabase();

    await expect(bootstrapCompanionDatabase(fixture.port, {
      allowCreate: true,
      expectedHostName: 'A5',
      now: '2026-09-02T00:00:00.000Z'
    })).resolves.toMatchObject({ created: true, version: COMPANION_DATABASE_VERSION });

    expect(fixture.sqlite.prepare(
      'SELECT id, kind, title, sync_dirty FROM nodes WHERE id = ?'
    ).get(INBOX_NODE_ID)).toEqual({ id: INBOX_NODE_ID, kind: 'folder', sync_dirty: 0, title: 'Inbox' });
    expect(fixture.sqlite.prepare('SELECT node_id, position FROM node_order').get())
      .toEqual({ node_id: INBOX_NODE_ID, position: 0 });
    fixture.sqlite.close();
  });

  it('does not synthesize Inbox while opening an existing database', async () => {
    const fixture = emptyDatabase();
    fixture.sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    fixture.sqlite.prepare('INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)')
      .run('device_id', 'existing-device', '2026-09-01T00:00:00.000Z');
    fixture.sqlite.pragma(`user_version = ${COMPANION_DATABASE_VERSION}`);

    await bootstrapCompanionDatabase(fixture.port, {
      allowCreate: false,
      expectedHostName: 'A5',
      now: '2026-09-02T00:00:00.000Z'
    });

    expect(fixture.sqlite.prepare('SELECT COUNT(*) FROM nodes').pluck().get()).toBe(0);
    fixture.sqlite.close();
  });
});
