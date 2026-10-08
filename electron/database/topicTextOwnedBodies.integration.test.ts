// @vitest-environment node
import { bytesToHex } from '@noble/hashes/utils.js';
import { afterEach, expect, it } from 'vitest';

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
  const ids = whole.snapshot.text_alternatives!.map((entry) => entry.id);
  const hashes = whole.snapshot.text_alternatives!.map((entry) => entry.body_blob_hash);
  host.sqlite.prepare('DELETE FROM content_blob_data WHERE hash IN (SELECT value FROM json_each(?))')
    .run(JSON.stringify(hashes));

  const current = await host.current();
  const historical = await loadStoredSyncNodeVersionRecord(host.db, whole.version_id!);
  expect(wholeBodies(current)).toEqual(wholeBodies(whole));
  expect(wholeBodies(historical!)).toEqual(wholeBodies(whole));
  expect(current.version_id).toBe(whole.version_id);
  expect(current.content_hash).toBe(whole.content_hash);
  expect(current.snapshot.text_alternatives!.map((entry) => entry.id)).toEqual(ids);
  expect(current.snapshot).not.toHaveProperty('text_alternative_bodies');

  const selected = current.snapshot.text_alternatives![0]!;
  const expected = current.alternative_bodies!.find((body) => body.hash === selected.body_blob_hash)!.text;
  expect(loadNodeTextAlternativePreviewWithDriver(createBetterSqlite3Driver(host.sqlite), 'topic', selected.id))
    .toMatchObject({ current_content: whole.body_text, updated_content: expected, alternative_id: selected.id });
  await mutateTopicText(host.db, { nodeId: 'topic', alternativeId: selected.id, action: 'promoted',
    now: new Date().toISOString(), versionId: 'selection', hostName: 'local' });
  const promoted = await host.current();
  expect(promoted.body_text).toBe(expected);
  expect(promoted.parent_version_ids).toEqual([whole.version_id]);
  expect(promoted.snapshot.text_alternatives!.map((entry) => entry.id)).not.toContain(selected.id);
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

it('keeps unexpired complete alternatives when another choice expires and rolls back a failed adoption', async () => {
  const host = textDevice();
  devices.push(host);
  const record = textBranch('selected', 'Main body');
  const bodies = ['Expires first', 'Expires later'].map((text) => ({ text, hash: hashTextBody(text) }));
  record.alternative_bodies = bodies;
  record.snapshot.text_alternatives = bodies.map((body, index) => ({ id: `choice-${index}`,
    body_blob_hash: body.hash, source_host_name: 'peer', created_at: record.version_created_at!,
    expires_at: `${2099 + index}-01-01T00:00:00.000Z` }));
  await host.receive([record]);
  const advertised = await readFramedSyncInventoryEntry(host.db, { globalId: 'topic', objectType: 'node' });
  expect(advertised!.resourceHashes.map(bytesToHex)).toEqual(expect.arrayContaining(bodies.map((body) => body.hash)));
  host.sqlite.exec("CREATE TRIGGER reject_expiry BEFORE UPDATE OF current_version_id ON nodes BEGIN SELECT RAISE(ABORT, 'reject_expiry'); END");
  await expect(expireTopicText(host.db, 'topic', '2099-06-01T00:00:00.000Z')).rejects.toThrow('reject_expiry');
  expect(wholeBodies(await host.current())).toEqual(wholeBodies(record));
  host.sqlite.exec('DROP TRIGGER reject_expiry');
  await expireTopicText(host.db, 'topic', '2099-06-01T00:00:00.000Z');
  const expired = await host.current();
  expect(expired.body_text).toBe('Main body');
  expect(expired.alternative_bodies).toEqual([bodies[1]]);
  expect(expired.snapshot.text_selection).toEqual(record.snapshot.text_selection);
  expect(expired.parent_version_ids).toEqual([record.version_id]);
});
