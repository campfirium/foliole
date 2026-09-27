import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
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
    expect(fixture.sqlite.prepare('SELECT parent_id, child_ids_json FROM parent_child_order').get())
      .toEqual({ parent_id: 'parent-child-order:root', child_ids_json: JSON.stringify([INBOX_NODE_ID]) });
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

describe('companion order migration', () => {
  it('extracts existing direct-child order during the version 40 upgrade', async () => {
    const fixture = emptyDatabase();
    fixture.sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    fixture.sqlite.prepare('INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)')
      .run('device_id', 'existing-device', '2026-09-01T00:00:00.000Z');
    const insertNode = fixture.sqlite.prepare(
      `INSERT INTO nodes (id, parent_id, kind, title, is_title_manual, content, created_at, updated_at)
       VALUES (?, ?, 'topic', ?, 1, '', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`
    );
    insertNode.run('parent', null, 'Parent');
    insertNode.run('child-b', 'parent', 'B');
    insertNode.run('child-a', 'parent', 'A');
    const insertOrder = fixture.sqlite.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');
    insertOrder.run('parent', 0);
    insertOrder.run('child-a', 1);
    insertOrder.run('child-b', 2);
    fixture.sqlite.pragma('user_version = 39');

    await bootstrapCompanionDatabase(fixture.port, {
      allowCreate: false, expectedHostName: 'A5', now: '2026-09-02T00:00:00.000Z'
    });

    const row = fixture.sqlite.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?')
      .get('parent') as { child_ids_json: string };
    expect(JSON.parse(row.child_ids_json)).toEqual(['child-a', 'child-b']);
    expect(fixture.sqlite.prepare(
      "SELECT content_hash, sync_dirty FROM sync_object_state WHERE object_type = 'parent_child_order' AND object_id = 'parent'"
    ).get()).toEqual({
      content_hash: computeSyncContentHash('parent_child_order', {
        parent_id: 'parent', child_ids_json: row.child_ids_json
      }),
      sync_dirty: 1
    });
    fixture.sqlite.close();
  });
});
