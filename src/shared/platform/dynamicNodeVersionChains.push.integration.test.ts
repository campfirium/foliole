// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { closeLibraries, createPeer, edit, history, joinPeers, startLibraries } from '../../../electron/database/syncEmptyLibraryTestSupport.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { loadCurrentSyncNodeRecord } from '../../../lib/core/sync/syncNodeGraph.js';

import { createCompanionSyncbackDbStore } from './companion/sync/syncback/companionSyncbackDbStore.js';
import { nodeVersionSyncAdapter } from './companionSyncPushProtocol.js';
beforeEach(startLibraries);
afterEach(closeLibraries);

it.each(['member-left', 'group-left', 'group-switched', 'orphan-payload', 'local-device'] as const)(
  'releases obsolete sends after %s without losing current content', async (change) => {
    const source = createPeer('source');
    const target = createPeer('target');
    joinPeers(source, target);
    const sent = edit(source, 'sent');
    const store = createCompanionSyncbackDbStore(source.port);
    const payload = nodeVersionSyncAdapter.buildPushPayload((await loadCurrentSyncNodeRecord(source.port, 'topic'))!);
    await store.stagePushItems(target.id, [payload]);
    const hold = source.db.prepare('SELECT pack_id FROM node_version_outbound_holds').get() as { pack_id: string };
    source.db.prepare('INSERT INTO node_version_outbound_payload_holds VALUES (?, ?, ?)').run(hold.pack_id, 'topic', sent);
    const head = edit(source, 'current');
    expect(history(source).map((row) => [row.version_id, row.body_text])).toEqual([[sent, 'sent'], [head, 'current']]);
    if (change === 'member-left') source.db.prepare("UPDATE sync_group_devices SET state = 'left' WHERE device_identity_key = ?").run(target.id);
    if (change === 'group-left') source.db.prepare('DELETE FROM sync_group_local_state').run();
    if (change === 'group-switched') {
      source.db.prepare("INSERT INTO sync_groups VALUES ('new-group', 'New', 'new-key', 'now', 'now')").run();
      source.db.prepare("UPDATE sync_group_local_state SET group_id = 'new-group'").run();
    }
    if (change === 'orphan-payload') source.db.prepare('DELETE FROM node_version_outbound_holds').run();
    if (change === 'local-device') source.db.prepare('UPDATE node_version_outbound_holds SET device_identity_key = ?').run(source.id);
    await collectNodeVersionPayloads(source.port, 'topic');
    expect(history(source).map((row) => [row.version_id, row.body_text, row.parent_version_id]))
      .toEqual([[sent, null, null], [head, 'current', sent]]);
  }
);

it('freezes a concrete push and accepts only its exact acknowledgement', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const sent = edit(source, 'sent');
  const record = (await loadCurrentSyncNodeRecord(source.port, 'topic'))!;
  const store = createCompanionSyncbackDbStore(source.port);
  const payload = nodeVersionSyncAdapter.buildPushPayload(record);
  await store.stagePushItems(target.id, [payload]);
  const head = edit(source, 'current');
  expect(history(source).map((row) => row.version_id)).toEqual([sent, head]);
  const ack = { clientOpId: payload.clientOpId, identity: payload.identity,
    status: 'accepted' as const, versionId: sent };
  await expect(store.savePushAcks(target.id, [{ ...ack, versionId: head }])).resolves.toEqual([]);
  expect(source.db.prepare('SELECT COUNT(*) AS count FROM node_version_outbound_holds').get()).toEqual({ count: 1 });
  await expect(store.savePushAcks(target.id, [ack])).resolves.toEqual([payload.clientOpId]);
  expect(source.db.prepare('SELECT COUNT(*) AS count FROM node_version_outbound_holds').get()).toEqual({ count: 0 });
  expect(history(source).map((row) => row.version_id)).toEqual([sent, head]);
  const next = nodeVersionSyncAdapter.buildPushPayload((await loadCurrentSyncNodeRecord(source.port, 'topic'))!);
  await store.stagePushItems(target.id, [next]);
  await store.savePushAcks(target.id, [{ ...ack, clientOpId: next.clientOpId, versionId: head }]);
  expect(history(source).map((row) => [row.version_id, row.body_text, row.parent_version_id]))
    .toEqual([[sent, 'sent', null], [head, 'current', sent]]);
});
