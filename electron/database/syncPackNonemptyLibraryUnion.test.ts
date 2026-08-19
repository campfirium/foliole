// @vitest-environment node

import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-nonempty-union-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-nonempty-union-'));
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('converges two nonempty libraries to the topic, attachment, reading, and review union', async () => {
  const packA = await buildLibraryPack('a', 'b-device');
  const packB = await buildLibraryPack('b', 'a-device');

  const summaryA = await applyPeerPack('a', packB, 'a-device');
  const summaryB = await applyPeerPack('b', packA, 'b-device');
  expect(summaryA).toEqual(summaryB);
  expect(summaryA).toEqual({
    attachmentIds: ['a'.repeat(64), 'b'.repeat(64)],
    nodeIds: ['topic-a', 'topic-b'],
    readingIds: ['topic-a', 'topic-b'],
    reviewIds: ['topic-a', 'topic-b'],
    reviewOps: ['op-a', 'op-b']
  });

  closeDatabaseConnection();
  openLibrary('a');
  expect(readSummary()).toEqual(summaryA);
});

async function buildLibraryPack(suffix: 'a' | 'b', peerId: string) {
  openLibrary(suffix);
  insertLibraryFacts(suffix);
  const packPath = path.join(tempRoot, `${suffix}.syncpack`);
  await buildDesktopSyncPack({
    createdAt: `2026-08-14T02:0${suffix === 'a' ? 1 : 2}:00.000Z`,
    fromDeviceId: `${suffix}-device`,
    fromStateSeq: 0,
    outputPath: packPath,
    packId: `${suffix}-pack`,
    toPeerId: peerId
  });
  closeDatabaseConnection();
  return extractIncoming(packPath, path.join(tempRoot, `${suffix}.db`));
}

async function applyPeerPack(library: 'a' | 'b', incomingPath: string, hostName: string) {
  openLibrary(library);
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: `union-${library}` });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0,
      hostName
    })).resolves.toMatchObject({ applied: true, toStateSeq: 4 });
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 4,
      hostName
    })).resolves.toMatchObject({ applied: false });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
  const summary = readSummary();
  closeDatabaseConnection();
  return summary;
}

function openLibrary(name: string) {
  mockedAppDataDir = path.join(tempRoot, `library-${name}`);
  initializeDatabaseConnection(openDatabaseConnection());
  openDatabaseConnection().sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sync_push_ack (
      client_op_id TEXT PRIMARY KEY NOT NULL, object_type TEXT NOT NULL,
      object_id TEXT NOT NULL, state_seq INTEGER, status TEXT NOT NULL, acked_at TEXT NOT NULL
    )
  `);
}

function insertLibraryFacts(suffix: 'a' | 'b') {
  const db = openDatabaseConnection().sqlite;
  const nodeId = `topic-${suffix}`;
  const versionId = `${suffix}#1`;
  const hash = suffix.repeat(64);
  const createdAt = `2026-08-14T02:0${suffix === 'a' ? 1 : 2}:00.000Z`;
  db.prepare(
    `INSERT INTO nodes (
       id, kind, title, is_title_manual, hide_title_heading, content,
       current_version_id, created_at, updated_at
     ) VALUES (?, 'topic', ?, 1, 0, ?, ?, ?, ?)`
  ).run(nodeId, `Topic ${suffix.toUpperCase()}`, `Body ${suffix}`, versionId, createdAt, createdAt);
  db.prepare(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, host_name, created_at,
       content_hash, body_text, snapshot_json
     ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
  ).run(versionId, nodeId, `${suffix}-device`, createdAt, `node-${suffix}`, `Body ${suffix}`,
    JSON.stringify({ id: nodeId, title: `Topic ${suffix.toUpperCase()}` }));
  db.prepare(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES (?, NULL, 'application/octet-stream', 1, ?)`
  ).run(hash, createdAt);
  db.prepare(
    `INSERT INTO attachment_blobs (
       attachment_id, content_hash, storage_key, size_bytes, mime_type,
       availability, source_host_name, created_at
     ) VALUES (?, ?, ?, 1, 'application/octet-stream', 'local', ?, ?)`
  ).run(hash, hash, hash, `${suffix}-device`, createdAt);
  db.prepare('INSERT INTO node_attachments VALUES (?, ?, ?)').run(nodeId, hash, 'reference');
  db.prepare(
    `INSERT INTO node_reading (
       node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
       next_at, priority, repetition_count, state
     ) VALUES (?, 60000, 1.5, ?, ?, 0, 1, 'active')`
  ).run(nodeId, createdAt, createdAt);
  db.prepare(
    `INSERT INTO node_review (
       node_id, due, last_review_at, state, stability, difficulty,
       elapsed_days, scheduled_days, reps, lapses
     ) VALUES (?, ?, ?, 2, 2, 3, 1, 1, 1, 0)`
  ).run(nodeId, createdAt, createdAt);
  db.prepare(
    `INSERT INTO review_log (
       id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
       due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
     ) VALUES (?, ?, ?, ?, 3, 'ts-fsrs@4', ?, ?, 1, 2, ?, 2, 3)`
  ).run(`log-${suffix}`, `op-${suffix}`, `${suffix}-device`, nodeId,
    createdAt, createdAt, createdAt);
  insertStates(suffix, nodeId, versionId, hash, createdAt);
}

function insertStates(suffix: string, nodeId: string, versionId: string, hash: string, at: string) {
  const statement = openDatabaseConnection().sqlite.prepare(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, current_version_id, content_hash,
       last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  );
  statement.run('node', nodeId, 1, versionId, `node-${suffix}`, `${suffix}-device`, at);
  statement.run('attachment', hash, 2, null, `attachment-${suffix}`, `${suffix}-device`, at);
  statement.run('node_reading', nodeId, 3, null, `reading-${suffix}`, `${suffix}-device`, at);
  statement.run('node_review', nodeId, 4, null, `review-${suffix}`, `${suffix}-device`, at);
}

function readSummary() {
  const db = openDatabaseConnection().sqlite;
  const ids = (sql: string) => (db.prepare(sql).all() as Array<{ id: string }>).map((row) => row.id);
  return {
    attachmentIds: ids('SELECT id FROM attachments ORDER BY id'),
    nodeIds: ids(`SELECT id FROM nodes WHERE id LIKE 'topic-%' ORDER BY id`),
    readingIds: ids('SELECT node_id AS id FROM node_reading ORDER BY node_id'),
    reviewIds: ids('SELECT node_id AS id FROM node_review ORDER BY node_id'),
    reviewOps: ids('SELECT op_id AS id FROM review_log ORDER BY op_id')
  };
}

function extractIncoming(packPath: string, outputPath: string) {
  const buffer = fsSync.readFileSync(packPath);
  for (let offset = 0; buffer.readUInt32LE(offset) === 0x04034b50;) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const contentStart = offset + 30 + nameLength + extraLength;
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    if (name === 'incoming.db.deflate') {
      fsSync.writeFileSync(outputPath, inflateSync(buffer.subarray(contentStart, contentStart + size)));
      return outputPath;
    }
    offset = contentStart + size;
  }
  throw new Error('incoming_pack_missing');
}
