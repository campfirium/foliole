// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createCapacitorSqliteDbPort } from '../../../capacitorSqliteDbPort';
import { createFakeCapacitorConnection, installCompanionNodeSchema } from '../../../companionSyncNodeVersionsTestSupport';

import { loadCompanionSnapshotNodeRows } from './companionSnapshotNodeRows';

it('reads node facts and scoped children independently of import sources', async () => {
  const database = new Database(':memory:');
  try {
    installCompanionNodeSchema(database);
    database.exec(`INSERT INTO nodes (id, parent_id, title, content, created_at, updated_at) VALUES
      ('root', NULL, 'Root', '---\ncollections: [One]\n---\nBody', 'now', 'now'),
      ('child', 'root', 'Child', 'Child body', 'now', 'now'),
      ('other', NULL, 'Other', 'Unrelated body', 'now', 'now');
      DROP TABLE import_sources;`);
    const port = createCapacitorSqliteDbPort(createFakeCapacitorConnection(database) as never, 'android');
    const all = await loadCompanionSnapshotNodeRows(port, 'Phone');
    expect(all.map(row => row.id).sort()).toEqual(['child', 'other', 'root']);
    const scoped = await loadCompanionSnapshotNodeRows(port, 'Phone', ['root']);
    expect(scoped.map(row => row.id).sort()).toEqual(['child', 'root']);
    expect(scoped.find(row => row.id === 'root')).toMatchObject({ has_content: 1,
      collection_source_content: '---\ncollections: [One]\n---\n' });
    expect(scoped.every(row => !Object.hasOwn(row, 'readwise_remote_lifecycle'))).toBe(true);
    expect((await loadCompanionSnapshotNodeRows(port, 'Phone', ['root'], true)).map(row => row.id)).toEqual(['root']);
    expect(await loadCompanionSnapshotNodeRows(port, 'Phone', ['missing'], true)).toEqual([]);
    expect(await loadCompanionSnapshotNodeRows(port, 'Phone', [])).toEqual([]);
  } finally { database.close(); }
});

it('keeps learning visibility consistent for live, deleted, missing and cyclic ancestors', async () => {
  const database = new Database(':memory:');
  try {
    installCompanionNodeSchema(database);
    database.exec(`INSERT INTO nodes (id, parent_id, title, created_at, updated_at) VALUES
      ('root', NULL, 'Root', 'now', 'now'), ('child', 'root', 'Child', 'now', 'now');
      INSERT INTO node_review(node_id, due) VALUES ('child', 'later');
      INSERT INTO node_reading(node_id, last_handled_at, next_at) VALUES ('child', 'now', 'later');`);
    const port = createCapacitorSqliteDbPort(createFakeCapacitorConnection(database) as never, 'ios');
    for (const [mutation, visible] of [
      ["UPDATE nodes SET deleted_at = NULL, parent_id = NULL WHERE id = 'root'", true],
      ["UPDATE nodes SET deleted_at = 'now' WHERE id = 'root'", false],
      ["UPDATE nodes SET deleted_at = NULL, parent_id = 'child' WHERE id = 'root'", false],
      ["UPDATE nodes SET parent_id = 'missing' WHERE id = 'root'", false],
      ["UPDATE nodes SET parent_id = NULL WHERE id = 'root'", true]
    ] as const) {
      database.pragma('foreign_keys = OFF');
      database.exec(mutation);
      database.pragma('foreign_keys = ON');
      const scoped = await loadCompanionSnapshotNodeRows(port, 'Phone', ['child'], true);
      const full = await loadCompanionSnapshotNodeRows(port, 'Phone');
      expect(scoped).toEqual(full.filter(row => row.id === 'child'));
      expect(scoped[0]!.due).toBe(visible ? 'later' : null);
      expect(scoped[0]!.reading_state).toBe(visible ? 'active' : null);
    }
  } finally { database.close(); }
});
