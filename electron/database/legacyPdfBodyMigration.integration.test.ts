// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { readDataMigrationState } from '../../lib/core/database/dataMigrationState.js';

import { migrateLegacyBodyConsistency, needsLegacyBodyConsistencySnapshot } from './legacyBodyConsistencyMigration.js';
import { BODY_COLLECTION_ID, BODY_REPAIR_ID } from './legacyBodyMigrationState.js';
import { closeLibraries, createPeer, edit, history, startLibraries } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);
const PDF = 'a'.repeat(64);
const PLACEHOLDER = '# source\n\nLinked PDF source ready for the reader surface.';
const BODY = '# Topic\n\nFirst page.\n\nSecond page.';

function seed() {
  const peer = createPeer('pdf');
  const version = edit(peer, BODY);
  peer.db.prepare("UPDATE nodes SET content = ?, resource_references = ?, import_source_fingerprint = 'source' WHERE id = ?")
    .run(PLACEHOLDER, JSON.stringify([{ storage_key: `${PDF}.pdf`, role: 'reference', original_name: 'source.pdf' }]), 'topic');
  peer.db.prepare('UPDATE node_sync_versions SET body_text = ? WHERE version_id = ?').run(PLACEHOLDER, version);
  peer.db.prepare(`INSERT INTO import_sources (source_fingerprint, provider, source_kind, source_name,
    source_locator, first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id)
    VALUES ('source', 'desktop_text_file', 'pdf', 'source.pdf', 'fixture', 'now', 'now', 'content', 'topic')`).run();
  const page = peer.db.prepare('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?)');
  page.run(PDF, 1, ' First page. ');
  page.run(PDF, 2, 'Second page.');
  return { peer, version };
}

function migrate(peer: ReturnType<typeof createPeer>) {
  peer.driver.transaction(() => migrateLegacyBodyConsistency({ driver: peer.driver, sqlite: peer.db }, peer.name, false));
}

it('repairs the proven PDF placeholder, preserves old facts and retires only its inline shell', () => {
  const { peer, version } = seed();
  const old = history(peer)[0];
  expect(needsLegacyBodyConsistencySnapshot({ driver: peer.driver, sqlite: peer.db })).toBe(true);
  migrate(peer);
  expect(history(peer)).toHaveLength(2);
  expect(history(peer).find((row) => row.version_id === version)).toEqual(old);
  expect(history(peer).find((row) => row.version_id !== version)).toMatchObject({ body_text: BODY, parent_version_id: version });
  expect(peer.db.prepare('SELECT content FROM nodes').pluck().get()).toBe('');
  expect(readDataMigrationState(peer.db, BODY_REPAIR_ID)?.status).toBe('completed');
  const after = history(peer);
  migrate(peer);
  expect(history(peer)).toEqual(after);
});

it('finishes a previously protected library even when collection already completed', () => {
  const { peer } = seed();
  peer.db.prepare('UPDATE pdf_page_text SET text = ? WHERE page = 2').run('Unconfirmed');
  migrate(peer);
  peer.db.prepare('INSERT INTO legacy_body_migration_protections VALUES (?, ?, ?)')
    .run(BODY_COLLECTION_ID, 'topic', 'inline_contradictory_or_blob_invalid');
  peer.db.prepare('INSERT INTO data_migration_state VALUES (?, ?, ?, ?)')
    .run(BODY_COLLECTION_ID, 'collection', 'completed', 'now');
  peer.db.prepare('UPDATE pdf_page_text SET text = ? WHERE page = 2').run('Second page.');
  migrate(peer);
  expect(history(peer)).toHaveLength(2);
  expect(peer.db.prepare('SELECT content FROM nodes').pluck().get()).toBe('');
  expect(peer.db.prepare('SELECT * FROM legacy_body_migration_protections').all()).toEqual([]);
  expect(readDataMigrationState(peer.db, BODY_COLLECTION_ID)?.status).toBe('completed');
});

it.each(['different-inline', 'different-pages', 'missing-source', 'missing-reference', 'dirty', 'editing'] as const)(
  'preserves %s instead of treating it as an established PDF placeholder', (condition) => {
  const { peer, version } = seed();
  if (condition === 'different-inline') peer.db.prepare("UPDATE nodes SET content = 'User original'").run();
  if (condition === 'different-pages') peer.db.prepare("UPDATE pdf_page_text SET text = 'Different'").run();
  if (condition === 'missing-source') peer.db.prepare('DELETE FROM import_sources').run();
  if (condition === 'missing-reference') peer.db.prepare("UPDATE nodes SET resource_references = '[]'").run();
  if (condition === 'dirty') peer.db.prepare('UPDATE nodes SET sync_dirty = 1').run();
  if (condition === 'editing') peer.db.prepare('INSERT INTO node_version_local_holds VALUES (?, ?, ?, ?)')
    .run('editor', 'topic', version, 'now');
  const before = history(peer);
  const inline = peer.db.prepare('SELECT content FROM nodes').pluck().get();
  migrate(peer);
  expect(history(peer)).toEqual(before);
  expect(peer.db.prepare('SELECT content FROM nodes').pluck().get()).toBe(inline);
  expect(readDataMigrationState(peer.db, BODY_REPAIR_ID)?.status).toBe('running');
});

it('rolls back version and inline retirement together when publication fails', () => {
  const { peer } = seed();
  peer.db.exec("CREATE TRIGGER reject_pdf_repair BEFORE UPDATE ON sync_object_state BEGIN SELECT RAISE(ABORT, 'failed'); END");
  const before = history(peer);
  expect(() => migrate(peer)).toThrow('failed');
  expect(history(peer)).toEqual(before);
  expect(peer.db.prepare('SELECT content FROM nodes').pluck().get()).toBe(PLACEHOLDER);
  expect(readDataMigrationState(peer.db, BODY_REPAIR_ID)).toBeNull();
});
