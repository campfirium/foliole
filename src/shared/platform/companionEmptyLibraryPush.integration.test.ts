// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { applyNodeVersionPushWithDbPort } from '../../../electron/database/companionSyncPushNodeVersionWithDbPort.js';
import { applyCompanionStateSyncPushWithDbPort } from '../../../electron/database/companionSyncPushWithDbPort.js';
import type { Peer } from '../../../electron/database/syncEmptyLibraryTestSupport.js';
import { assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries, sync } from '../../../electron/database/syncEmptyLibraryTestSupport.js';
import { applyLocalContentEdit } from '../../../lib/core/sync/localContentEdit.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';

import { createCompanionSyncbackDbStore } from './companion/sync/syncback/companionSyncbackDbStore.js';
import { nodeVersionSyncAdapter, type SyncPushAck } from './companionSyncPushProtocol.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

async function mobileEdit(peer: Peer, baseVersionId: string, content: string, versionId: string, second: number) {
  return applyLocalContentEdit(peer.port, { baseVersionId, content, hideTitleHeading: false,
    hostName: peer.name, nodeId: 'topic', title: 'Topic', updatedAt: `2026-09-30T01:00:0${second}.000Z`, versionId },
  undefined, { enqueueSearchInvalidations: false });
}

function initializeMobileHost(peer: Peer) {
  peer.db.exec('CREATE TABLE IF NOT EXISTS companion_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  peer.db.prepare("INSERT INTO companion_meta VALUES ('host_name', ?)").run(peer.name);
}

function mobileStore(peer: Peer) {
  return createCompanionSyncbackDbStore({ ...peer.port, query: (sql, params = []) => {
    if (!/\?\d+/.test(sql)) return peer.port.query(sql, params);
    const bound: (typeof params)[number][] = [];
    const positional = sql.replace(/\?(\d+)/g, (_, index: string) => {
      bound.push(params[Number(index) - 1]!);
      return '?';
    });
    return peer.port.query(positional, bound);
  } });
}

it('pushes each successive production mobile edit when synchronized immediately', async () => {
  const desktop = createPeer('desktop');
  const mobile = createPeer('mobile');
  joinPeers(desktop, mobile);
  initializeMobileHost(mobile);
  let base = edit(desktop, '123');
  await sync(desktop, mobile);
  const store = mobileStore(mobile);
  for (const [index, content] of ['123456', '123456789'].entries()) {
    const version = `mobile-${index}`;
    await mobileEdit(mobile, base, content, version, index + 1);
    const records = await store.loadNodeVersions(desktop.id, null);
    const result = await applyCompanionStateSyncPushWithDbPort(desktop.port,
      records.map((record) => nodeVersionSyncAdapter.buildPushPayload(record)));
    expect(result.acks.every((ack) => ack.status === 'accepted')).toBe(true);
    assertPersisted(desktop, content, version);
    base = version;
  }
});

it.each([false, true])('pushes two offline production edits without losing the intermediate parent (collection=%s)', async (collect) => {
  const desktop = createPeer('desktop');
  const mobile = createPeer('mobile');
  joinPeers(desktop, mobile);
  initializeMobileHost(mobile);
  const a = edit(desktop, '123');
  await sync(desktop, mobile);
  await sync(mobile, desktop);
  await mobileEdit(mobile, a, '123456', 'mobile-B', 1);
  await mobileEdit(mobile, 'mobile-B', '123456789', 'mobile-C', 2);
  if (collect) {
    expect(await collectNodeVersionPayloads(mobile.port, 'topic')).toEqual({ released: 1, skipped: null });
    expect(history(mobile).find((row) => row.version_id === 'mobile-B')?.body_text).toBeNull();
  }
  const store = mobileStore(mobile);
  const records = await store.loadNodeVersions(desktop.id, null);
  const payloads = records.map((record) => nodeVersionSyncAdapter.buildPushPayload(record));
  await store.stagePushItems(desktop.id, payloads);
  if (collect) {
    const identityOnly = payloads.find((item) => item.clientOpId === 'node:mobile-B')!;
    expect((await applyNodeVersionPushWithDbPort(desktop.port, identityOnly)).acks[0]?.status).toBe('accepted');
    assertPersisted(desktop, '123', a);
  }
  const result = await applyCompanionStateSyncPushWithDbPort(desktop.port, [...payloads].reverse());
  expect(result.acks).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: 'accepted', versionId: 'mobile-B' }),
    expect.objectContaining({ status: 'accepted', versionId: 'mobile-C' })
  ]));
  const decoded = JSON.parse(JSON.stringify(result)) as { acks: SyncPushAck[] };
  await store.savePushAcks(desktop.id, decoded.acks);
  expect(await store.loadNodeVersions(desktop.id, null)).toEqual([]);
  assertPersisted(desktop, '123456789', 'mobile-C');
  expect(history(desktop).find((row) => row.version_id === 'mobile-B')?.body_text)
    .toBe(collect ? null : '123456');
  const replay = await applyCompanionStateSyncPushWithDbPort(desktop.port,
    [...records].reverse().map((record) => nodeVersionSyncAdapter.buildPushPayload(record)));
  expect(replay.acks.every((ack) => ack.status === 'accepted')).toBe(true);
  assertPersisted(desktop, '123456789', 'mobile-C');
});
