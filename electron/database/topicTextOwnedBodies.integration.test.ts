// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionIndependentTopicAlternatives } from '../../lib/core/database/independentTopicAlternativesMigration.js';
import { buildCanonicalNodeSyncPayload } from '../../lib/core/database/nodeSyncPayload.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { loadRetainedSyncNodeVersionRecords, loadStoredSyncNodeVersionRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';
import { expireTopicText } from '../../lib/core/sync/topicTextExpiry.js';
import { mutateTopicText } from '../../lib/core/sync/topicTextMutation.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { loadNodeTextAlternativePreviewWithDriver } from './nodeTextAlternatives.js';
import { textBranch, textDevice, wholeBodies } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach((device) => device.sqlite.close()));

it('reads each version and selects its complete alternatives after shared body copies are removed', async () => {
  const host = textDevice();
  devices.push(host);
  const base = textBranch('base', 'Base');
  await host.receive([base, textBranch('main', 'Main complete body with enough text', base)]);
  const alternatives = ['B\r\n😀\u0000end', 'C\n第二段'];
  const whole = await host.receive(alternatives.map((body, index) => textBranch(`branch-${index}`, body, base)));
  const ids = (await host.alternatives()).map((entry) => entry.id);
  const hashes = (await host.alternatives()).map((entry) => entry.body_blob_hash);
  host.sqlite.prepare('DELETE FROM content_blob_data WHERE hash IN (SELECT value FROM json_each(?))')
    .run(JSON.stringify(hashes));

  const current = await host.current();
  const historical = await loadStoredSyncNodeVersionRecord(host.db, whole.version_id!);
  expect(await host.wholeBodies()).toEqual(new Set([whole.body_text, ...alternatives]));
  expect(historical!.body_text).toBe(whole.body_text);
  expect(current.version_id).toBe(whole.version_id);
  expect(current.content_hash).toBe(whole.content_hash);
  expect((await host.alternatives()).map(entry => entry.id)).toEqual(ids);
  expect(current.snapshot).not.toHaveProperty('text_alternative_bodies');

  const selected = (await host.alternatives())[0]!;
  const expected = host.sqlite.prepare('SELECT body_text FROM node_text_alternatives WHERE alternative_id=?').pluck().get(selected.id) as string;
  expect(loadNodeTextAlternativePreviewWithDriver(createBetterSqlite3Driver(host.sqlite), 'topic', selected.id))
    .toMatchObject({ current_content: whole.body_text, updated_content: expected, alternative_id: selected.id });
  await mutateTopicText(host.db, { nodeId: 'topic', alternativeId: selected.id, action: 'promoted',
    now: new Date().toISOString(), versionId: 'selection', hostName: 'local' });
  const promoted = await host.current();
  expect(promoted.body_text).toBe(expected);
  expect(promoted.parent_version_ids).toEqual([whole.version_id]);
  expect((await host.alternatives()).map(entry => entry.id)).not.toContain(selected.id);
});

it('keeps complete alternatives in tombstone facts and restores them when a complete original version returns', async () => {
  const host = textDevice();
  devices.push(host);
  const record = textBranch('deleted-version', 'Original complete deleted body');
  const alternative = { hash: hashTextBody('Complete deleted alternative'), text: 'Complete deleted alternative' };
  record.is_tombstone = true;
  record.snapshot.deleted_at = record.updated_at;
  record.alternative_bodies = [alternative];
  record.snapshot.text_alternatives = [{ id: 'deleted-choice', body_blob_hash: alternative.hash,
    source_host_name: 'peer', created_at: record.updated_at, expires_at: '2100-01-01T00:00:00.000Z' }];
  record.content_hash = hashTextBody(JSON.stringify(buildCanonicalNodeSyncPayload({
    ...nodeSyncSnapshotHashMetadata(record.snapshot), content: record.body_text! })));
  await upsertRemoteVersion(host.db, record);
  await applyRemoteNodeTombstone(host.db, record);
  expect(wholeBodies((await loadRetainedSyncNodeVersionRecords(host.db, [record.version_id!])).get(record.version_id!)!))
    .toEqual(wholeBodies(record));
  host.sqlite.prepare(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_remove(json_set(snapshot_json, '$.content', NULL), '$.text_alternative_bodies')
    WHERE version_id = ?`).run(record.version_id);
  await upsertRemoteVersion(host.db, record);
  const restored = await loadStoredSyncNodeVersionRecord(host.db, record.version_id!);
  expect(wholeBodies(restored!)).toEqual(wholeBodies(record));
  expect(restored!.content_hash).toBe(record.content_hash);
  expect(restored!.snapshot.text_alternatives).toEqual(record.snapshot.text_alternatives);
});

it('keeps unexpired complete alternatives when another choice expires and rolls back a failed expiry', async () => {
  const host = textDevice();
  devices.push(host);
  const record = textBranch('selected', 'Main body');
  const bodies = ['Expires first', 'Expires later'].map((text) => ({ text, hash: hashTextBody(text) }));
  record.alternative_bodies = bodies;
  record.snapshot.text_alternatives = bodies.map((body, index) => ({ id: `choice-${index}`,
    body_blob_hash: body.hash, source_host_name: 'peer', created_at: record.version_created_at!,
    expires_at: `${2099 + index}-01-01T00:00:00.000Z` }));
  await host.receive([record]);
  await host.db.transaction(tx => migrateCompanionIndependentTopicAlternatives(tx));
  const before = await host.current();
  const advertised = await readFramedSyncInventoryEntry(host.db, { globalId: 'topic', objectType: 'node' });
  expect(advertised!.stateFactIds?.filter(id => id.includes('node_text_alternative'))).toHaveLength(2);
  host.sqlite.exec("CREATE TRIGGER reject_expiry BEFORE UPDATE ON node_text_alternatives BEGIN SELECT RAISE(ABORT, 'reject_expiry'); END");
  await expect(expireTopicText(host.db, 'topic', '2099-06-01T00:00:00.000Z')).rejects.toThrow('reject_expiry');
  expect(await host.wholeBodies()).toEqual(new Set(['Main body', ...bodies.map(body => body.text)]));
  host.sqlite.exec('DROP TRIGGER reject_expiry');
  await expireTopicText(host.db, 'topic', '2099-06-01T00:00:00.000Z');
  const expired = await host.current();
  expect(expired.body_text).toBe('Main body');
  expect(await host.wholeBodies()).toEqual(new Set(['Main body', 'Expires later']));
  expect(expired.snapshot.text_selection).toEqual(record.snapshot.text_selection);
  expect(expired.version_id).toBe(before.version_id);
});
