// @vitest-environment node
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

it('reads active node-owned resource references after attachment registry retirement', () => {
  const source = fs.readFileSync(new globalThis.URL('../../android/app/src/androidTest/java/com/foliole/android/FolioleCompanionInitialResourceProof.java', import.meta.url), 'utf8');
  const expression = source.match(/db\.rawQuery\(("[\s\S]*?), null\)/u)?.[1];
  if (!expression) throw new Error('Resource proof query not found');
  const sql = [...expression.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/gu)]
    .map((match) => JSON.parse(`"${match[1]}"`)).join('');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE nodes (id TEXT, resource_references TEXT, deleted_at TEXT)');
    const references = JSON.stringify([{ storage_key: `${'a'.repeat(64)}.png`, role: 'image', original_name: null }]);
    db.prepare('INSERT INTO nodes VALUES (?, ?, ?)').run('active', references, null);
    db.prepare('INSERT INTO nodes VALUES (?, ?, ?)').run('deleted', '[{"storage_key":"deleted.png"}]', '2026-10-12');
    expect(db.prepare(sql).all().map((row) => JSON.parse(row.resource_references)))
      .toEqual([JSON.parse(references)]);
  } finally { db.close(); }
});

it('requires an active group and a persisted current version with no pending branches', () => {
  const source = fs.readFileSync(new globalThis.URL('../../android/app/src/androidTest/java/com/foliole/android/FolioleCompanionInitialResourceProof.java', import.meta.url), 'utf8');
  const expression = source.match(/nodeCommitted = count\(db, ([\s\S]*?),\s*nodeId, groupId\)/u)?.[1];
  if (!expression) throw new Error('Node commit query not found');
  const sql = [...expression.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/gu)]
    .map((match) => JSON.parse(`"${match[1]}"`)).join('');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE nodes (id TEXT, current_version_id TEXT, deleted_at TEXT);
      CREATE TABLE node_sync_versions (object_id TEXT, version_id TEXT);
      CREATE TABLE node_sync_version_parents (version_id TEXT, parent_version_id TEXT);
      CREATE TABLE sync_group_local_state (group_id TEXT, local_device_identity_key TEXT, state TEXT);
      INSERT INTO nodes VALUES ('node', 'current', NULL);
      INSERT INTO sync_group_local_state VALUES ('group', 'local', 'active');
      INSERT INTO node_sync_versions VALUES ('node', 'old');`);
    const count = () => Object.values(db.prepare(sql).get('node', 'group'))[0];
    expect(count()).toBe(0);
    db.exec("UPDATE node_sync_versions SET version_id='current'");
    expect(count()).toBe(1);
    db.exec("UPDATE sync_group_local_state SET state='left'");
    expect(count()).toBe(0);
    db.exec(`UPDATE sync_group_local_state SET state='active'; INSERT INTO node_sync_versions VALUES ('node', 'branch')`);
    expect(count()).toBe(0);
  } finally { db.close(); }
});

it('accepts readable inline body text even when its content-addressed hash is retained', () => {
  const source = fs.readFileSync(new globalThis.URL('../../android/app/src/androidTest/java/com/foliole/android/FolioleCompanionInitialResourceProof.java', import.meta.url), 'utf8');
  const expression = source.match(/bodyReady = count\(db, ([\s\S]*?), nodeId\)/u)?.[1];
  if (!expression) throw new Error('Body proof query not found');
  const sql = [...expression.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/gu)]
    .map((match) => JSON.parse(`"${match[1]}"`)).join('');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE nodes (id TEXT, content TEXT, body_blob_hash TEXT, deleted_at TEXT);
      CREATE TABLE content_blob_data (hash TEXT);
      INSERT INTO nodes VALUES ('node', 'Resource LAN body remains readable.', 'body-hash', NULL);`);
    expect(Object.values(db.prepare(sql).get('node'))[0]).toBe(1);
    db.exec('UPDATE nodes SET content=NULL');
    expect(Object.values(db.prepare(sql).get('node'))[0]).toBe(0);
  } finally { db.close(); }
});
