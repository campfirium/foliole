// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { prepareImportedNodeDeletionVersions } from '../../electron/database/importedNodeDeletionVersions.js';
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { recordTopicDailyCount } from '../../lib/core/database/reviewDailyCounts.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { beginSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { createCompanionRequestFixture, native } from './companionRequestSync.testSupport.js';

const deletedAt = '2026-10-07T00:00:00.000Z';
const sharedBody = 'Body shared with the surviving topic';
const isolatedBody = 'Body held only in the receiver cache';
const alternativeBody = 'Alternative held only in the receiver cache';
const legacy = 'legacy-history';
const importId = 'legacy-import';
const countDay = '2026-10-05';
const known = 'known-history';

type Version = { version_id: string; snapshot_json: string };

function instrument(sqlite: Database.Database) {
  sqlite.exec('CREATE TABLE version_writes (seq INTEGER PRIMARY KEY, id, op, has_body, compact, tombstone)');
  for (const event of ['INSERT', 'UPDATE']) sqlite.exec(`CREATE TRIGGER version_writes_${event}
    AFTER ${event} ON node_sync_versions BEGIN
      INSERT INTO version_writes(id, op, has_body, compact, tombstone)
        VALUES (NEW.version_id, '${event}', NEW.body_text IS NOT NULL,
          json_type(NEW.snapshot_json,'$.deleted_version_metadata_digest') IS NOT NULL,
          EXISTS(SELECT 1 FROM node_sync_tombstones WHERE node_id=NEW.object_id));
    END`);
}

function sourceVersions(db: Database.Database, id: string) {
  return db.prepare(`SELECT version_id, snapshot_json FROM node_sync_versions
    WHERE object_id=? ORDER BY json_extract(snapshot_json, '$.updated_at'), version_id`)
    .all(id) as Version[];
}

function retireLegacyVersions(db: Database.Database, versions: Version[]) {
  const statement = db.prepare(`UPDATE node_sync_versions SET body_text=NULL,
    snapshot_json=json_set(?, '$.content',NULL,'$.body_deleted',json('true'), '$.title','', '$.opening_text',NULL)
    WHERE version_id=?`);
  for (const { snapshot_json, version_id } of versions) statement.run(snapshot_json, version_id);
}

function setLegacyAlternative(db: Database.Database, version: Version) {
  const alternative = { id: 'retired-alternative', body_blob_hash: hashTextBody(alternativeBody),
    source_host_name: 'Legacy', created_at: deletedAt, expires_at: '2026-11-06T00:00:00.000Z' };
  db.prepare(`UPDATE node_sync_versions SET snapshot_json=json_set(snapshot_json,'$.text_alternatives',json(?))
    WHERE version_id=?`).run(JSON.stringify([alternative]), version.version_id);
}

function permanentDeletion(source: Database.Database, nodeIds: string[]) {
  source.exec("ATTACH DATABASE ':memory:' AS search");
  const driver = createBetterSqlite3Driver(source);
  initializeWorkspaceSearchSidecar({ sqlite: source, driver });
  prepareImportedNodeDeletionVersions(driver, nodeIds, deletedAt);
  deleteNodesPermanently(driver, { nodeIds, deletedAt });
}

async function beginAdoption(host: Awaited<ReturnType<typeof createCompanionRequestFixture>>) {
  const { leftSnapshot, rightSnapshot } = host.fixture;
  await beginSyncGroupLocalAdoption(host.db, { endpointUrl: rightSnapshot.origin, groupId: 't326-group',
    libraryEpoch: `${leftSnapshot.deviceId}-epoch`, providerDeviceId: rightSnapshot.deviceId,
    providerDeviceName: 'Provider', providerPlatform: 'darwin' });
}

function persistedHistory(db: Database.Database, id: string) {
  return db.prepare(`SELECT version.version_id, version.object_id, version.parent_version_id, version.host_name,
    version.content_hash, version.created_at, version.body_text, version.snapshot_json,
    (SELECT json_group_array(json_array(parent_id, ordinal)) FROM (
      SELECT parent.parent_version_id AS parent_id, parent.ordinal
      FROM node_sync_version_parents parent WHERE parent.version_id=version.version_id ORDER BY parent.ordinal)) AS parent_edges
    FROM node_sync_versions version WHERE version.object_id=? ORDER BY version.created_at, version.version_id`).all(id);
}

type CompanionFixture = Awaited<ReturnType<typeof createCompanionRequestFixture>>;

async function prepareHistory(host: CompanionFixture, source: Database.Database, ordinary: boolean) {
  await beginAdoption(host);
  const seed = (nodeId: string, content: string, updatedAt = '2026-10-05T01:00:00.000Z') =>
    host.fixture.right.seed({ nodeId, title: nodeId, content, updatedAt });
  await seed('survivor', sharedBody);
  let localVersions: Version[] = [];
  if (ordinary) {
    await seed(known, 'Retired local history');
    await seed(known, 'Existing local body', '2026-10-05T02:00:00.000Z');
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    localVersions = sourceVersions(host.sqlite, known);
    expect(localVersions).toHaveLength(2);
    retireLegacyVersions(host.sqlite, localVersions.slice(0, 1));
    expect(host.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id=?').get(localVersions[1]!.version_id))
      .toEqual({ body_text: 'Existing local body' });
  }
  await seed(legacy, sharedBody);
  await seed(legacy, isolatedBody, '2026-10-05T02:00:00.000Z');
  await seed(legacy, 'Last body before deletion', '2026-10-05T03:00:00.000Z');
  const retired = sourceVersions(source, legacy).slice(0, 2);
  expect(retired).toHaveLength(2);
  const receiver = createBetterSqlite3Driver(host.sqlite);
  upsertTextBodyBlob(receiver, sharedBody, deletedAt);
  upsertTextBodyBlob(receiver, isolatedBody, deletedAt);
  upsertTextBodyBlob(receiver, alternativeBody, deletedAt);
  if (ordinary) {
    setLegacyAlternative(host.sqlite, localVersions[0]!);
    setLegacyAlternative(source, localVersions[0]!);
  }
  const provenance = { latest_node_id: legacy, last_content_fingerprint: 'original-file' };
  await applySyncObjectInTransaction(createBetterSqliteDbPort(source), {
    object_type: 'import_source', object_id: importId, content_hash: computeSyncContentHash('import_source', provenance),
    updated_at: deletedAt, deleted_at: null, payload_json: JSON.stringify(provenance)
  });
  recordTopicDailyCount(createBetterSqlite3Driver(source), { day: countDay, nodeId: legacy, hostName: 'Provider' });
  permanentDeletion(source, [legacy, ...(ordinary ? [known] : [])]);
  retireLegacyVersions(source, retired);
  setLegacyAlternative(source, retired[0]!);
  instrument(host.sqlite);
  return { old: retired[0]!, later: retired[1]!, localVersions };
}

function tombstone(db: Database.Database) {
  return db.prepare('SELECT version_id, parent_version_id, content_hash FROM node_sync_tombstones WHERE node_id=?').get(legacy);
}

async function rejectHistoryAndReopen(host: CompanionFixture) {
  host.sqlite.exec(`CREATE TRIGGER reject_received_history BEFORE INSERT ON node_sync_tombstones
    WHEN NEW.node_id = '${legacy}' BEGIN SELECT RAISE(ABORT, 'reject_received_history'); END`);
  expect((await host.sync()).remainingStructureChangeCount).toBeGreaterThan(0);
  expect(persistedHistory(host.sqlite, legacy)).toEqual([]);
  expect(tombstone(host.sqlite)).toBeUndefined();
  expect(persistedHistory(host.sqlite, known)).toEqual(expect.arrayContaining([
    expect.objectContaining({ body_text: null, snapshot_json: expect.stringContaining('deleted_version_metadata_digest') })
  ]));
  await host.restart();
  host.sqlite.exec('DROP TRIGGER reject_received_history');
}

async function syncAndObserveVersionReads(host: CompanionFixture) {
  const reads = new Map<string, string[]>();
  const original = host.db;
  native.db = observeVersionReads(original, reads, host.sqlite);
  try { expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 }); }
  finally { native.db = original; }
  return reads;
}

it.each(['first adoption', 'ordinary sync', 'ordinary retry'])('receives one tombstone and no remote history during %s', async mode => {
  const host = await createCompanionRequestFixture();
  const source = new Database(host.fixture.rightSnapshot.databasePath);
  const ordinary = mode !== 'first adoption';
  try {
    const { old, later, localVersions } = await prepareHistory(host, source, ordinary);
    if (mode === 'ordinary retry') await rejectHistoryAndReopen(host);
    const reads = await syncAndObserveVersionReads(host);
    if (mode === 'ordinary sync') {
      expect(reads.get(localVersions[0]!.version_id) ?? []).toEqual([]);
      expect(host.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id=?').get(localVersions[1]!.version_id))
        .toEqual({ body_text: null });
    }
    const trace = host.sqlite.prepare('SELECT op,has_body,compact,tombstone FROM version_writes WHERE id=? ORDER BY seq');
    for (const version of [old, later]) expect(trace.all(version.version_id)).toEqual([]);
    const checkBodies = () => {
      const blob = host.sqlite.prepare('SELECT CAST(data AS TEXT) AS body FROM content_blob_data WHERE hash=?');
      if (ordinary) expect(blob.get(hashTextBody(sharedBody))).toEqual({ body: sharedBody });
      expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='survivor'").get()).toEqual({ content: sharedBody });
      expect(persistedHistory(host.sqlite, legacy)).toEqual([]);
      expect(host.sqlite.prepare('SELECT latest_node_id, last_content_fingerprint FROM import_sources WHERE source_fingerprint=?')
        .get(importId)).toEqual({ latest_node_id: legacy, last_content_fingerprint: 'original-file' });
      expect(host.sqlite.prepare('SELECT count FROM topic_daily_counts WHERE day_key=?').pluck().get(countDay)).toBe(1);
    };
    checkBodies();
    const deletion = tombstone(host.sqlite);
    expect(deletion).toEqual(tombstone(source));
    await host.restart();
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    expect(tombstone(host.sqlite)).toEqual(deletion);
    checkBodies();
  } finally {
    source.close();
    await host.close();
  }
}, 60000);

function observeVersionReads(db: DbPort, reads: Map<string, string[]>, sqlite: Database.Database): DbPort {
  const totalChanges = sqlite.prepare('SELECT total_changes()').pluck();
  return {
    async run(sql, params) {
      const before = Number(totalChanges.get());
      const result = await db.run(sql, params);
      // Android counts writes performed by triggers in the same statement.
      return { ...result, changes: Number(totalChanges.get()) - before };
    },
    query(sql, params) {
      const shape = sql.startsWith('SELECT length(CAST(body_text AS BLOB)) AS body_length') ? 'descriptor'
        : sql.startsWith('SELECT json_extract(alternative.value,') ? 'alternatives'
          : sql.startsWith('SELECT substr(CAST(body_text AS BLOB)') ? 'bytes' : undefined;
      const versionId = params?.at(-1);
      if (shape && typeof versionId === 'string') reads.set(versionId, [...reads.get(versionId) ?? [], shape]);
      return db.query(sql, params) as never;
    },
    transaction: execute => db.transaction(tx => execute(observeVersionReads(tx, reads, sqlite)))
  };
}
