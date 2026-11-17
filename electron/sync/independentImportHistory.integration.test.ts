// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { runPreparedImport } from '../../lib/core/database/importPipeline.js';
import { recordTopicDailyCount } from '../../lib/core/database/reviewDailyCounts.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { flushNodeSyncVersionWithDriver } from '../database/nodeSyncVersionFromDriver.js';

import { requestSyncFixtureIdentity } from './desktopRequestSyncFixtureIdentity.js';
import { deletePermanently, groupRound, nodeTraces, passTime, retireThirdMember, withDb, withFixture } from './syncHistoryHorizon.testSupport.js';

const importedAt = '2026-09-30T10:00:00.000Z';
const day = '2026-09-30';
const prepared = (at: string) => createPreparedDesktopTextImport({
  content: '# Imported\nBody', degradedReason: null, fileName: 'note.md', filePath: '/fixture/note.md', importedAt: at, kind: 'markdown'
});

function importNote(path: string, at: string) {
  return withDb(path, sqlite => runPreparedImport(createBetterSqlite3Driver(sqlite), prepared(at)));
}

function history(path: string, fingerprint: string) {
  return withDb(path, db => ({
    source: db.prepare('SELECT first_imported_at, latest_node_id, last_content_fingerprint FROM import_sources WHERE source_fingerprint = ?')
      .get(fingerprint),
    count: db.prepare('SELECT count FROM topic_daily_counts WHERE day_key = ?').pluck().get(day)
  }));
}

async function assertInventory(path: string, id: string) {
  const sqlite = new Database(path, { readonly: true });
  try {
    const entries = await readFramedSyncInventory(createBetterSqliteDbPort(sqlite));
    expect(entries.find(entry => entry.globalId === id && entry.objectType === 'node'))
      .toMatchObject({ permanentlyDeleted: true, stateFactIds: [], requiredRelationIds: [], reviewFactIds: [] });
    expect(entries.filter(entry => entry.objectType === 'import_source' || entry.objectType === 'topic_daily_count'))
      .toHaveLength(2);
  } finally { sqlite.close(); }
}

it('relays import provenance and daily counts to an empty device even after reclaiming the node deletion',
  { meta: { calibratedMs: 60_000 } }, async () => withFixture(async (fixture, trackThird) => {
    const a = fixture.leftSnapshot;
    const b = fixture.rightSnapshot;
    const paths = [a.databasePath, b.databasePath];
    const first = importNote(a.databasePath, importedAt);
    const id = first.nodeId!;
    expect(id).toBeTruthy();
    withDb(a.databasePath, sqlite => flushNodeSyncVersionWithDriver(createBetterSqlite3Driver(sqlite), id, 'writer'));
    withDb(a.databasePath, sqlite => recordTopicDailyCount(createBetterSqlite3Driver(sqlite),
      { day, nodeId: id, hostName: 'writer' }));
    deletePermanently(a.databasePath, id);
    await assertInventory(a.databasePath, id);
    const expected = { source: { first_imported_at: importedAt, latest_node_id: id,
      last_content_fingerprint: first.contentFingerprint }, count: 1 };
    expect(await groupRound(fixture.left, b)).toMatchObject({ complete: true });
    for (const file of paths) {
      expect(nodeTraces(file, id)).toMatchObject({ node: 0, tombstone: 1 });
      expect(history(file, first.sourceFingerprint)).toEqual(expected);
    }
    const thirdId = requestSyncFixtureIdentity('desktop-c').identity_key;
    for (const file of paths) {
      retireThirdMember(file, thirdId);
      passTime(file);
    }
    expect(await groupRound(fixture.left, b)).toMatchObject({ complete: true });
    for (const file of paths) {
      expect(nodeTraces(file, id)).toEqual({ node: 0, tombstone: 0, versions: 0, inventory: 0 });
      expect(history(file, first.sourceFingerprint)).toEqual(expected);
    }
    const { snapshot: reopened } = await fixture.restartRight();
    // Register the third fixture identity only after the old deletion has been reclaimed.
    for (const file of paths) withDb(file, db => db.prepare(`UPDATE sync_group_devices SET state='active',
      left_at=NULL, joined_at=? WHERE device_identity_key=?`).run(new Date().toISOString(), thirdId));
    const third = await fixture.startThird();
    trackThird(third.process);
    expect(history(third.snapshot.databasePath, first.sourceFingerprint)).toEqual({ source: undefined, count: undefined });
    for (let replay = 0; replay < 2; replay++) {
      expect(await groupRound(third.process, reopened)).toMatchObject({ complete: true });
      expect(history(third.snapshot.databasePath, first.sourceFingerprint)).toEqual(expected);
      expect(nodeTraces(third.snapshot.databasePath, id).node).toBe(0);
    }
    const reimported = importNote(third.snapshot.databasePath, new Date().toISOString());
    expect(reimported).toMatchObject({ sourceFingerprint: first.sourceFingerprint, duplicateSemantic: 'new' });
    expect(reimported.nodeId).not.toBe(id);
    expect(await groupRound(third.process, reopened)).toMatchObject({ complete: true });
    expect(history(reopened.databasePath, first.sourceFingerprint)).toEqual({
      source: { ...expected.source, latest_node_id: reimported.nodeId }, count: 1
    });
  }));
