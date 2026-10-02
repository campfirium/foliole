// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const databases: Database.Database[] = [];
const roots: string[] = [];
function database() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'legacy-companion-'));
  roots.push(root);
  const db = new Database(path.join(root, 'fixture.db'));
  databases.push(db);
  return db;
}
function fixture() {
  const db = database();
  db.exec(COMPANION_SCHEMA_STATEMENTS.join(';'));
  db.exec(`INSERT INTO companion_meta VALUES ('device_id','fixture','then');
    INSERT INTO companion_meta VALUES ('host_name','fixture','then');
    CREATE TABLE node_order (node_id TEXT PRIMARY KEY, position INTEGER NOT NULL);
    INSERT INTO nodes (id,title,created_at,updated_at) VALUES ('a','A','then','now'),('b','B','then','now');
    INSERT INTO node_order VALUES ('a',0),('b',1);
    INSERT INTO parent_child_order VALUES ('parent-child-order:root','["b","a"]','newer');
    PRAGMA user_version = 61;`);
  return { db, port: createBetterSqliteDbPort(db) };
}
afterEach(() => {
  databases.splice(0).forEach((db) => db.close());
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

it('retires companion old ordering without overriding current ordering and does not recreate it on restart', async () => {
  const { db, port } = fixture();
  const before = db.prepare('SELECT * FROM parent_child_order').all();
  const nodes = db.prepare('SELECT * FROM nodes ORDER BY id').all();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await bootstrapCompanionDatabase(port, { allowCreate: false, expectedHostName: 'fixture', now: 'now' });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='node_order'").get()).toBeUndefined();
    expect(db.prepare('SELECT * FROM parent_child_order').all()).toEqual(before);
    expect(db.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(nodes);
  }
  expect(db.pragma('user_version', { simple: true })).toBe(62);
});

it('restores companion historical storage and schema version when the migration cannot commit', async () => {
  const { db, port } = fixture();
  await expect(bootstrapCompanionDatabase(port, {
    allowCreate: false, expectedHostName: 'fixture', now: 'now',
    beforeVersionCommit: () => { throw new Error('commit failed'); }
  })).rejects.toThrow('commit failed');
  expect(db.prepare('SELECT * FROM node_order ORDER BY position').all())
    .toEqual([{ node_id: 'a', position: 0 }, { node_id: 'b', position: 1 }]);
  expect(db.pragma('user_version', { simple: true })).toBe(61);
});

it('keeps fresh companion databases free of old ordering storage', async () => {
  const db = database();
  await bootstrapCompanionDatabase(createBetterSqliteDbPort(db), {
    allowCreate: true, expectedHostName: 'fixture', now: 'now'
  });
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='node_order'").get()).toBeUndefined();
});
