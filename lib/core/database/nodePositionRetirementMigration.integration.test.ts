// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { COMPANION_DATABASE_VERSION } from '../../platform/nativeCompanionContract.js';

import { bootstrapCompanionDatabase } from './companionDatabaseLifecycle.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from './migrations.js';
import { NODE_VERSION_MEMBER_POSITION_SCHEMA } from './nodeVersionMemberPositionSchema.js';

function legacyPosition(db: Database.Database, version: number) {
  for (const sql of NODE_VERSION_MEMBER_POSITION_SCHEMA) db.exec(sql);
  db.exec(`INSERT INTO nodes (id, kind, title, content, current_version_id, created_at, updated_at)
    VALUES ('topic', 'topic', 'Retained', 'Original content', 'version', 'now', 'now');
    INSERT INTO node_sync_versions (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('version', 'topic', 'peer', 'now', 'hash', 'Original content', '{}');
    UPDATE node_version_local_proof_state SET proof_revision = 9;
    INSERT INTO node_version_device_revisions VALUES ('group', 'peer', 'epoch', 7, 'business', NULL, 'now');
    INSERT INTO node_version_local_source_revisions VALUES ('peer', 5);
    INSERT INTO node_version_member_positions VALUES
    ('position', 'group', 'peer', 'topic', 'epoch', 7, 'version', '[]', 'now', NULL);
    INSERT INTO sync_object_state (object_type, object_id, content_hash, updated_at, state_seq, last_modified_by_host_name)
    VALUES ('node_position', 'position', '${'a'.repeat(64)}', 'now', 1, 'peer');
    PRAGMA user_version = ${version}`);
}

function protectedFacts(db: Database.Database) {
  return ['nodes', 'node_sync_versions', 'node_sync_tombstones', 'node_version_local_proof_state',
    'node_version_device_revisions', 'node_version_local_source_revisions'].map(table =>
    db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

function assertRetired(db: Database.Database) {
  expect(db.prepare("SELECT object_id FROM sync_object_state WHERE object_type = 'node_position'").all()).toEqual([]);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'node_version_member_positions'").all()).toEqual([]);
}

it('retires v154 replication metadata atomically without touching user facts or proof revisions', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    legacyPosition(db, 154);
    const before = protectedFacts(db);
    expect(() => initializeDatabaseSchema(db, { beforeVersionCommit() { throw new Error('interrupted'); } }))
      .toThrow('interrupted');
    expect(db.prepare('SELECT fact_id FROM node_version_member_positions').all()).toEqual([{ fact_id: 'position' }]);
    expect(db.pragma('user_version', { simple: true })).toBe(154);
    initializeDatabaseSchema(db);
    assertRetired(db);
    expect(protectedFacts(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    initializeDatabaseSchema(db);
    assertRetired(db);
  } finally { db.close(); }
});

it('retires companion v83 positions and does not recreate them when reopening', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-position-retirement-'));
  const db = new Database(path.join(root, 'library.sqlite'));
  const port = createBetterSqliteDbPort(db);
  const request = { allowCreate: true, expectedHostName: 'mobile', now: '2026-10-16' };
  try {
    await bootstrapCompanionDatabase(port, request);
    legacyPosition(db, 83);
    const before = protectedFacts(db);
    await expect(bootstrapCompanionDatabase(port, { ...request,
      beforeVersionCommit() { throw new Error('interrupted'); }
    })).rejects.toThrow('interrupted');
    expect(db.pragma('user_version', { simple: true })).toBe(83);
    expect(db.prepare('SELECT fact_id FROM node_version_member_positions').all()).toEqual([{ fact_id: 'position' }]);
    expect(protectedFacts(db)).toEqual(before);
    await bootstrapCompanionDatabase(port, request);
    assertRetired(db);
    expect(protectedFacts(db)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
    await bootstrapCompanionDatabase(port, request);
    assertRetired(db);
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
