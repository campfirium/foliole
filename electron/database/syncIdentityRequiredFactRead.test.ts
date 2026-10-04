// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { syncIdentityPartition } from '../../lib/core/sync/syncIdentityDigest.js';
import { readSyncIdentityNodeFactGlobalPage,
  readSyncIdentityNodeFactInventory } from '../../lib/core/sync/syncIdentityNodeFactGlobalRead.js';
import { buildSyncIdentityNodeFactIndex,
  readSyncIdentityNodeFactProofRoot,
  readSyncIdentityNodeFactSummary } from '../../lib/core/sync/syncIdentityNodeFactIndex.js';
import { diffSyncIdentityGlobalPages } from '../../lib/core/sync/syncIdentityPagedDiff.js';
import { readSyncIdentityRequiredFacts } from '../../lib/core/sync/syncIdentityRequiredFactProjection.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

function library(retired: boolean) {
  const db = new Database(':memory:');
  initializeDatabaseSchema(db);
  db.exec(`INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
    VALUES ('topic', 'topic', 'Topic', 'restored', 'now', 'now')`);
  for (const [id, parent] of [
    ['base', null], ['middle', 'base'], ['restored', 'middle']
  ] as const) {
    db.prepare(`INSERT INTO node_sync_versions (version_id, object_id, parent_version_id,
      host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, 'topic', ?, 'A', 'now', ?, ?, ?)`)
      .run(id, parent, id, retired && id === 'middle' ? null : id,
        JSON.stringify({ content: retired && id === 'middle' ? null : id }));
    db.prepare('INSERT INTO node_version_local_origins (version_id) VALUES (?)').run(id);
    if (parent) db.prepare(`INSERT INTO node_sync_version_parents
      (version_id, parent_version_id, ordinal) VALUES (?, ?, 0)`).run(id, parent);
  }
  return db;
}

it('reads equivalent required facts from distinct legal retention shapes', async () => {
  const full = library(false);
  const retired = library(true);
  try {
    const left = await readSyncIdentityRequiredFacts(createBetterSqliteDbPort(full), 'topic');
    const right = await readSyncIdentityRequiredFacts(createBetterSqliteDbPort(retired), 'topic');
    expect(left).toEqual(right);
    expect(left?.protectedIds).toEqual(['restored']);
  } finally { full.close(); retired.close(); }
});

it('uses a local hold to expose a missing required ancestor relation', async () => {
  const full = library(false);
  const contracted = library(false);
  try {
    contracted.prepare("UPDATE node_sync_versions SET parent_version_id = NULL WHERE version_id = 'middle'").run();
    contracted.prepare("DELETE FROM node_sync_version_parents WHERE version_id = 'middle'").run();
    for (const db of [full, contracted]) db.prepare(`INSERT INTO node_version_local_holds
      (hold_id, object_id, version_id, created_at) VALUES ('editor', 'topic', 'base', 'now')`).run();
    const left = await readSyncIdentityRequiredFacts(createBetterSqliteDbPort(full), 'topic');
    const right = await readSyncIdentityRequiredFacts(createBetterSqliteDbPort(contracted), 'topic');
    expect(left?.protectedIds).toEqual(['base', 'restored']);
    expect(left?.facts).not.toEqual(right?.facts);
  } finally { full.close(); contracted.close(); }
});

it('reads every protection reference from the selected attached source view', async () => {
  const main = library(false);
  const view = library(false);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-identity-facts-'));
  const viewPath = path.join(root, 'view.db');
  try {
    main.prepare(`INSERT INTO node_version_local_holds
      (hold_id, object_id, version_id, created_at) VALUES ('editor', 'topic', 'base', 'now')`).run();
    await view.backup(viewPath);
    main.prepare('ATTACH DATABASE ? AS identity_view').run(viewPath);
    const port = createBetterSqliteDbPort(main);
    expect((await readSyncIdentityRequiredFacts(port, 'topic'))?.protectedIds)
      .toEqual(['base', 'restored']);
    expect((await readSyncIdentityRequiredFacts(port, 'topic', 'identity_view'))?.protectedIds)
      .toEqual(['restored']);
  } finally {
    main.close(); view.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

it('changes the proof root when a hold changes but retained rows do not', async () => {
  const db = library(false);
  const port = createBetterSqliteDbPort(db);
  try {
    db.prepare(`INSERT INTO sync_identity_index_rows
      (object_type, object_id, partition, fingerprint, updated_at)
      VALUES ('node', 'topic', ?, 'state', 'now')`)
      .run(syncIdentityPartition('node', 'topic'));
    await buildSyncIdentityNodeFactIndex(port);
    const before = await readSyncIdentityNodeFactSummary(port);
    const rawBefore = db.prepare(`SELECT digest FROM sync_identity_node_fact_summary
      ORDER BY partition`).all();
    const rootBefore = await readSyncIdentityNodeFactProofRoot(port);
    db.prepare(`INSERT INTO node_version_local_holds
      (hold_id, object_id, version_id, created_at)
      VALUES ('editor', 'topic', 'base', 'now')`).run();
    await buildSyncIdentityNodeFactIndex(port);
    const after = await readSyncIdentityNodeFactSummary(port);
    expect(db.prepare(`SELECT digest FROM sync_identity_node_fact_summary
      ORDER BY partition`).all()).toEqual(rawBefore);
    expect(after.map((row) => row.digest)).not.toEqual(before.map((row) => row.digest));
    expect(await readSyncIdentityNodeFactProofRoot(port)).not.toBe(rootBefore);
  } finally { db.close(); }
});

it('discovers a changed hold even when both sides retain identical version rows', async () => {
  const source = library(false);
  const receiver = library(false);
  try {
    for (const db of [source, receiver]) {
      db.prepare(`INSERT INTO sync_identity_index_rows
        (object_type, object_id, partition, fingerprint, updated_at)
        VALUES ('node', 'topic', ?, 'state', 'now')`)
        .run(syncIdentityPartition('node', 'topic'));
    }
    receiver.prepare(`INSERT INTO node_version_local_holds
      (hold_id, object_id, version_id, created_at)
      VALUES ('editor', 'topic', 'base', 'now')`).run();
    const sourcePort = createBetterSqliteDbPort(source);
    const receiverPort = createBetterSqliteDbPort(receiver);
    await buildSyncIdentityNodeFactIndex(sourcePort);
    await buildSyncIdentityNodeFactIndex(receiverPort);
    const sourceSummary = await readSyncIdentityNodeFactInventory(sourcePort);
    const receiverSummary = await readSyncIdentityNodeFactInventory(receiverPort);
    expect(source.prepare(`SELECT digest FROM sync_identity_node_fact_summary
      ORDER BY partition`).all()).toEqual(receiver.prepare(`SELECT digest
      FROM sync_identity_node_fact_summary ORDER BY partition`).all());
    const candidates = [];
    for await (const candidate of diffSyncIdentityGlobalPages(sourceSummary, receiverSummary,
      (after) => readSyncIdentityNodeFactGlobalPage(sourcePort, after),
      (after) => readSyncIdentityNodeFactGlobalPage(receiverPort, after))) candidates.push(candidate);
    expect(candidates).toMatchObject([{ kind: 'divergent',
      source: { object_id: 'topic' }, receiver: { object_id: 'topic' } }]);
  } finally { source.close(); receiver.close(); }
});
