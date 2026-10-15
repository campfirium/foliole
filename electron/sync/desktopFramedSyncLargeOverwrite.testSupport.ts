import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { LARGE_OVERWRITE_PREFIX, largeOverwriteAttachment, largeOverwriteAttachmentIdentity,
  largeOverwriteBody, largeOverwriteNodeId } from './desktopFramedSyncLargeOverwrite.fixture.js';

export function largeOverwriteState(databasePath: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return {
      nodes: sqlite.prepare<[string], { id: string; current_version_id: string }>(
        'SELECT id, current_version_id FROM nodes WHERE id LIKE ? ORDER BY id').all(`${LARGE_OVERWRITE_PREFIX}%`),
      versions: sqlite.prepare<[string], { object_id: string; version_id: string; content_hash: string;
        body_blob_hash: string; parent_version_id: string | null }>(
        `SELECT object_id, version_id, content_hash, json_extract(snapshot_json, '$.body_blob_hash') AS body_blob_hash, parent_version_id
          FROM node_sync_versions WHERE object_id LIKE ? ORDER BY object_id, version_id`).all(`${LARGE_OVERWRITE_PREFIX}%`),
      parents: sqlite.prepare<[string], { version_id: string; parent_version_id: string; ordinal: number }>(
        `SELECT edge.version_id, edge.parent_version_id, edge.ordinal FROM node_sync_version_parents edge
          JOIN node_sync_versions version ON version.version_id = edge.version_id
          WHERE version.object_id LIKE ? ORDER BY version.object_id, edge.version_id, edge.ordinal`).all(`${LARGE_OVERWRITE_PREFIX}%`),
      retiredCount: sqlite.prepare<[string], { count: number }>(`SELECT count(*) AS count FROM node_sync_versions
        WHERE object_id LIKE ? AND json_extract(snapshot_json, '$.body_deleted') = 1`).get(`${LARGE_OVERWRITE_PREFIX}%`)?.count,
      retiredTables: sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'framed_sync_receipts'").all(),
      inlineCount: sqlite.prepare<[string], { count: number }>(`SELECT count(*) AS count FROM node_sync_versions
        WHERE object_id LIKE ? AND (body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text')`)
        .get(`${LARGE_OVERWRITE_PREFIX}%`)?.count,
      continuousTable: sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'content_blob_data'").get()
    };
  } finally { sqlite.close(); }
}

export async function verifyLargeOverwriteBodies(databasePath: string) {
  const state = largeOverwriteState(databasePath);
  expect(state.nodes).toHaveLength(1000);
  expect(state.versions).toHaveLength(6000);
  expect(state.parents).toHaveLength(7000);
  expect(state.retiredCount).toBe(5000);
  expect(state.inlineCount).toBe(1000);
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const db = createBetterSqliteDbPort(sqlite);
    for (let index = 0; index < 1000; index++) {
      const versions = state.versions.filter((row) => row.object_id === largeOverwriteNodeId(index));
      expect(versions).toHaveLength(6);
      expect(versions.every(version => /^[a-f0-9]{64}$/u.test(version.body_blob_hash))).toBe(true);
      const current = await loadCurrentSyncNodeRecord(db, largeOverwriteNodeId(index), false);
      if (!current || typeof current.body_text !== 'string') throw new Error('large_overwrite_body_missing');
      const texts = [current.body_text, ...(current.alternative_bodies ?? []).map(body => body.text)];
      expect(texts).toHaveLength(3);
      const expected = new Set([0, 1, 2].map(pass => createHash('sha256')
        .update(largeOverwriteBody(index, pass)).digest('hex')));
      for (const text of texts) {
        const bytes = Buffer.from(text, 'utf8');
        expect(bytes.length).toBe(8192);
        expect(expected.delete(createHash('sha256').update(bytes).digest('hex'))).toBe(true);
      }
      expect(expected.size).toBe(0);
      const content = sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(largeOverwriteNodeId(index));
      expect(content === largeOverwriteBody(index, 2)).toBe(true);
    }
  } finally { sqlite.close(); }
  return state;
}

export async function verifyLargeOverwriteAttachments(stateRoot: string) {
  const hashes = new Set<string>();
  for (let index = 0; index < 100; index++) {
    const { hash, storageKey } = largeOverwriteAttachmentIdentity(index);
    const bytes = await fs.readFile(path.join(stateRoot, 'documents', 'Foliole', 'Assets', storageKey));
    expect(bytes).toEqual(largeOverwriteAttachment(index));
    expect(bytes.length).toBe(65536);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
    hashes.add(hash);
  }
  expect(hashes.size).toBe(100);
}
