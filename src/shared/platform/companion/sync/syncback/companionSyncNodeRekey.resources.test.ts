// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../../../../../lib/core/database/companionSchemaStatements';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';

import { rekeyNodeObject } from './companionSyncNodeRekey';

it('preserves mounted files and their owner names when production rekey moves a node', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const sql of COMPANION_SCHEMA_STATEMENTS) db.exec(sql);
    const resources = JSON.stringify([{ storage_key: `${'a'.repeat(64)}.pdf`, role: 'reference', original_name: 'Selected.pdf' }]);
    db.prepare(`INSERT INTO nodes (id, title, content, resource_references, current_version_id, created_at, updated_at)
      VALUES ('source', 'Selection', 'Body', ?, 'version-source', 'now', 'now')`).run(resources);
    const snapshot = JSON.stringify({ id: 'source', title: 'Selection', resource_references: resources });
    db.prepare(`INSERT INTO node_sync_versions (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES ('version-source', 'source', 'Phone', 'now', 'hash', 'Body', ?)`).run(snapshot);
    const port: DbPort = {
      async query<T extends DbRow>(sql: string, params = []) { return db.prepare(sql).all(...params) as T[]; },
      async run(sql, params = []) {
        const result = db.prepare(sql).run(...params);
        return { changes: Number(result.changes), lastInsertRowId: result.lastInsertRowid };
      },
      async transaction(task) { return task(port); }
    };
    await rekeyNodeObject(port, 'source', 'canonical', 'version-source', 'version-canonical');
    expect(db.prepare('SELECT id, resource_references FROM nodes').all())
      .toEqual([{ id: 'canonical', resource_references: resources }]);
    const current = db.prepare("SELECT snapshot_json FROM node_sync_versions WHERE version_id = 'version-canonical'").get()!;
    expect(JSON.parse(String(current.snapshot_json))).toEqual({ id: 'canonical', title: 'Selection', resource_references: resources });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('attachments', 'node_attachments')").all()).toEqual([]);
  } finally { db.close(); }
});
