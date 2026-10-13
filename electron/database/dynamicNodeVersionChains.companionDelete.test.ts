// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';

import { permanentlyDelete } from './dynamicNodeVersionChains.delete.testSupport.js';
import { closeLibraries, createPeer, edit, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function originalFacts(db: Database.Database) {
  return {
    versions: db.prepare(`SELECT version_id, object_id, parent_version_id, content_hash,
      host_name, created_at FROM node_sync_versions WHERE object_id = 'topic' ORDER BY created_at`).all(),
    parents: db.prepare(`SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal`).all(),
    tombstone: db.prepare(`SELECT node_id, version_id, parent_version_id, content_hash, host_name,
      created_at, deleted_at FROM node_sync_tombstones WHERE node_id = 'topic'`).get()
  };
}

it('receives a deleted object complete chain through current requests with FK enabled and preserves it after reopening', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const base = edit(source, 'body');
  const tomb = permanentlyDelete(source);
  const original = originalFacts(source.db);
  expect(source.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(base)).toBe('body');
  expect(source.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").all()).toEqual([]);
  expect(source.db.prepare('SELECT version_id FROM node_sync_versions ORDER BY created_at').pluck().all())
    .toEqual([base, tomb.version_id]);
  await withLibraryRequestSnapshot(source, target, async replay => {
    await replay();
    await collectNodeVersionPayloads(target.port, 'topic');
    expect(originalFacts(target.db)).toEqual(original);
    expect(target.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(base)).toBeNull();
    expect(target.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(tomb.version_id))
      .toBe('body');
    expect(target.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
    expect(target.db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(target.db.pragma('foreign_key_check')).toEqual([]);
    await replay();
    expect(originalFacts(target.db)).toEqual(original);
  });
  const reopened = new Database(target.file, { readonly: true });
  try {
    expect(originalFacts(reopened)).toEqual(original);
    expect(reopened.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(tomb.version_id)).toBe('body');
    expect(reopened.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
    expect(reopened.pragma('foreign_key_check')).toEqual([]);
  } finally { reopened.close(); }
});
