// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { applyCompanionStateSyncPushWithDbPort } from '../../../electron/database/companionSyncPushWithDbPort.js';
import type { Peer } from '../../../electron/database/syncEmptyLibraryTestSupport.js';
import { assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries, sync } from '../../../electron/database/syncEmptyLibraryTestSupport.js';
import { applyLocalContentEdit } from '../../../lib/core/sync/localContentEdit.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { isStoredAncestorVersion, loadCurrentSyncNodeRecord } from '../../../lib/core/sync/syncNodeGraph.js';

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
    const payloads = records.map((record) => nodeVersionSyncAdapter.buildPushPayload(record));
    await store.stagePushItems(desktop.id, payloads);
    const result = await applyCompanionStateSyncPushWithDbPort(desktop.port, payloads);
    await store.savePushAcks(desktop.id, JSON.parse(JSON.stringify(result.acks)) as SyncPushAck[]);
    expect(result.acks.every((ack) => ack.status === 'accepted')).toBe(true);
    assertPersisted(desktop, content, version);
    base = version;
  }
});

it.each([false, true])('pushes offline edits and retires only the intermediate body (collection=%s)', async (collect) => {
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
    expect(await collectNodeVersionPayloads(mobile.port, 'topic')).toEqual({ released: 0, skipped: null });
    expect(history(mobile).find((row) => row.version_id === 'mobile-B'))
      .toMatchObject({ body_text: null, parent_version_id: a });
  }
  const store = mobileStore(mobile);
  const records = await store.loadNodeVersions(desktop.id, null);
  const payloads = records.map((record) => nodeVersionSyncAdapter.buildPushPayload(record));
  await store.stagePushItems(desktop.id, payloads);
  const result = await applyCompanionStateSyncPushWithDbPort(desktop.port, [...payloads].reverse());
  expect(result.acks).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: 'accepted', versionId: 'mobile-C' })
  ]));
  const decoded = JSON.parse(JSON.stringify(result)) as { acks: SyncPushAck[] };
  await store.savePushAcks(desktop.id, decoded.acks);
  expect(await store.loadNodeVersions(desktop.id, null)).toEqual([]);
  assertPersisted(desktop, '123456789', 'mobile-C');
  expect(history(desktop).find((row) => row.version_id === 'mobile-B'))
    .toMatchObject({ body_text: null, parent_version_id: a });
  const replay = await applyCompanionStateSyncPushWithDbPort(desktop.port,
    [...records].reverse().map((record) => nodeVersionSyncAdapter.buildPushPayload(record)));
  expect(replay.acks.every((ack) => ack.status === 'accepted')).toBe(true);
  assertPersisted(desktop, '123456789', 'mobile-C');
});

it.each([false, true])('keeps shared highlight history and later edits across a delayed branch receipt (overlap=%s)', async (overlap) => {
  const desktop = createPeer('desktop');
  const mobile = createPeer('mobile');
  joinPeers(desktop, mobile);
  initializeMobileHost(mobile);
  const anchor = { id: 'shared-anchor', kind: 'highlight' as const };
  const a = edit(desktop, '123\nx=0\n', 'Topic', anchor);
  await sync(desktop, mobile);
  const d = edit(desktop, '023\nx=0\n', 'Topic', anchor);
  const mobileBody = overlap ? '923\nx=0\n' : '123\nx=1\n';
  await mobileEdit(mobile, a, mobileBody, 'mobile-B', 1);
  const store = mobileStore(mobile);
  const payloads = (await store.loadNodeVersions(desktop.id, null))
    .map((record) => nodeVersionSyncAdapter.buildPushPayload(record));
  await store.stagePushItems(desktop.id, payloads);
  const response = await applyCompanionStateSyncPushWithDbPort(desktop.port, payloads);
  expect(response.acks).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'accepted', versionId: 'mobile-B' })]));
  expect(response.acks.every((ack) => ack.status === 'accepted')).toBe(true);
  expect(response.acks[0]?.canonicalObjectId).toBeUndefined();
  const resolved = await loadCurrentSyncNodeRecord(desktop.port, 'topic');
  expect(await isStoredAncestorVersion(desktop.port, a, resolved!.version_id!)).toBe(true);
  expect(await isStoredAncestorVersion(desktop.port, d, resolved!.version_id!)).toBe(true);
  expect(await isStoredAncestorVersion(desktop.port, 'mobile-B', resolved!.version_id!)).toBe(true);
  if (overlap) {
    const alternatives = desktop.db.prepare('SELECT body_text FROM node_text_alternatives').pluck().all();
    expect([resolved!.body_text, ...alternatives]).toEqual(expect.arrayContaining(['023\nx=0\n', mobileBody]));
  } else expect(resolved!.body_text).toBe('023\nx=1\n');
  const later = `${mobileBody}tail\n`;
  await mobileEdit(mobile, 'mobile-B', later, 'mobile-C', 2);
  await store.savePushAcks(desktop.id, JSON.parse(JSON.stringify(response.acks)) as SyncPushAck[]);
  await store.savePushAcks(desktop.id, JSON.parse(JSON.stringify(response.acks)) as SyncPushAck[]);
  assertPersisted(mobile, later, 'mobile-C');
  expect(history(mobile).map((row) => row.version_id)).toEqual(expect.arrayContaining(['mobile-B', 'mobile-C']));
  expect((await store.loadNodeVersions(desktop.id, null)).map((record) => record.version_id)).toContain('mobile-C');
  const next = (await store.loadNodeVersions(desktop.id, null))
    .map((record) => nodeVersionSyncAdapter.buildPushPayload(record));
  expect((await applyCompanionStateSyncPushWithDbPort(desktop.port, next)).acks[0]?.status).toBe('accepted');
  await sync(desktop, mobile);
  await sync(mobile, desktop);
  const final = await loadCurrentSyncNodeRecord(desktop.port, 'topic');
  assertPersisted(desktop, final!.body_text!, final!.version_id!);
  assertPersisted(mobile, final!.body_text!, final!.version_id!);
  if (!overlap) expect(final!.body_text).toBe('023\nx=1\ntail\n');
});

it.each(['folder', 'item'] as const)('keeps shared %s identity and ancestry during concurrent edits', async (kind) => {
  const desktop = createPeer('desktop');
  const mobile = createPeer('mobile');
  joinPeers(desktop, mobile);
  initializeMobileHost(mobile);
  const a = edit(desktop, '', 'Original', null, kind);
  await sync(desktop, mobile);
  const d = edit(desktop, '', 'Desktop title', null, kind);
  const b = edit(mobile, '', 'Mobile title', null, kind);
  const store = mobileStore(mobile);
  const payloads = (await store.loadNodeVersions(desktop.id, null))
    .map((record) => nodeVersionSyncAdapter.buildPushPayload(record));
  await store.stagePushItems(desktop.id, payloads);
  const response = await applyCompanionStateSyncPushWithDbPort(desktop.port, payloads);
  expect(response.acks).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'accepted', versionId: b })]));
  expect(response.acks.every((ack) => ack.status === 'accepted')).toBe(true);
  expect(response.acks[0]?.canonicalObjectId).toBeUndefined();
  const resolved = await loadCurrentSyncNodeRecord(desktop.port, 'topic');
  for (const id of [a, b, d]) {
    expect(await isStoredAncestorVersion(desktop.port, id, resolved!.version_id!)).toBe(true);
  }
  const c = edit(mobile, '', 'Later title', null, kind);
  await store.savePushAcks(desktop.id, JSON.parse(JSON.stringify(response.acks)) as SyncPushAck[]);
  assertPersisted(mobile, '', c);
  expect(history(mobile).map((row) => row.version_id)).toEqual(expect.arrayContaining([b, c]));
});
