// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { measureSqlStatements } from '../database/sqlStatementMeter.testSupport.js';
import { closeLibraries, createPeer, joinPeers, startLibraries, type Peer } from '../database/syncLibrary.testSupport.js';

import { applyWatchedPreparedImportIdentity } from './watchedPreparedImportIdentity.js';

let driver: DatabaseDriver;
let peer: Peer;
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => ({ driver }) }));
vi.mock('../database/watchedFolderBindings.js', () => ({
  resolveExecutableWatchedBinding: () => ({ bindingId: 'selected', executable: true })
}));

beforeEach(async () => {
  await startLibraries();
  peer = createPeer('watched');
  driver = peer.driver;
  joinPeers(peer);
  peer.db.prepare(`INSERT INTO watched_folder_conflict_decisions (group_id, conflict_key, decision_id,
    decided_at, decided_by_device_identity_key, selected_binding_ids_json, source_alias_refs_json)
    VALUES ('group', 'conflict', 'decision', 'now', ?, '["selected"]', '["watched:retired"]')`).run(peer.id);
});
afterEach(closeLibraries);

function addHistory(id: string, location: string, binding: string | null = null) {
  driver.execute(`INSERT INTO import_sources (source_fingerprint, provider, source_kind, source_name,
    source_locator, first_imported_at, last_imported_at, last_content_fingerprint, source_ref, source_location,
    watched_binding_id, watched_relative_path)
    VALUES (?, 'markdown', 'file', ?, '', 'now', 'now', 'body', ?, ?, ?, ?)`,
  [id, location, `watched:${binding ?? 'retired'}`, location, binding, binding ? location : null]);
}

function identity(relativePath: string) {
  return applyWatchedPreparedImportIdentity(
    { ruleId: 'selected', directoryPath: '/watched', sourceType: 'generic' } as
      Parameters<typeof applyWatchedPreparedImportIdentity>[0],
    { sourceName: relativePath } as Parameters<typeof applyWatchedPreparedImportIdentity>[1],
    { sourceFingerprint: 'draft' } as Parameters<typeof applyWatchedPreparedImportIdentity>[2]
  ).sourceFingerprint;
}

it('reads only matching alias history for fresh and previously imported paths', async () => {
  peer.db.transaction(() => {
    for (let i = 0; i < 200; i += 1) addHistory(`old-${i}`, `history/${i}.md`);
    addHistory('legacy-match', String.raw`./sub\folder/old.md`);
  })();
  if (peer.db.pragma('user_version', { simple: true }) === 199) {
    peer.db.exec('DROP INDEX idx_import_sources_watched_history_path; PRAGMA user_version = 198');
  }
  initializeDatabaseSchema(peer.db);

  const { result, report } = await measureSqlStatements(() => [identity('new.md'), identity('sub/folder/old.md')]);
  expect(result[0]).toEqual(expect.any(String));
  expect(result[0]).not.toBe('legacy-match');
  expect(result[1]).toBe('legacy-match');
  const historyReads = report.records.filter(row => row.sql.includes('FROM import_sources') && row.method === 'all');
  expect(historyReads.map(row => row.rows)).toEqual([0, 1]);

  const plan = peer.db.prepare(`EXPLAIN QUERY PLAN ${historyReads[0]!.sql}`).all('watched:retired', 'new.md') as { detail: string }[];
  expect(plan.some(row => /SEARCH .*source_ref=\? AND <expr>=\?/u.test(row.detail))).toBe(true);
});

it('preserves ambiguity and prefers a current binding mapping when present', () => {
  addHistory('first', './sub/duplicate.md');
  addHistory('second', String.raw`sub\duplicate.md`);
  expect(() => identity('sub/duplicate.md')).toThrow('watched_history_ambiguous');
  addHistory('current', 'sub/duplicate.md', 'selected');
  expect(identity('sub/duplicate.md')).toBe('current');
});
