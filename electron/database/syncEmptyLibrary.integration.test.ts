// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { loadCurrentSyncNodeRecord, loadMergeBase } from '../../lib/core/sync/syncNodeGraph.js';

import {
  assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries
} from './syncLibrary.testSupport.js';
import { syncRequestLibrary as sync } from './syncRequestLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';
import { wholeBodies } from './topicTextState.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('sends the current production head with a complete parent chain when earlier states were never sent', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  edit(source, '123');
  edit(source, '123456');
  const c = edit(source, '123456789');
  await sync(source, target);
  for (const peer of [source, target]) {
    assertPersisted(peer, '123456789', c);
    const rows = history(peer);
    expect(rows.at(-1)).toMatchObject({ version_id: c, body_text: '123456789' });
    expect(new Set(rows.map((row) => row.version_id)).size).toBe(rows.length);
  }
});

it('keeps successive synchronization and duplicate replay idempotent', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  for (const content of ['123', '123456', '123456789']) {
    const id = edit(source, content);
    await withLibraryRequestSnapshot(source, target, async replay => { await replay(); await replay(); });
    assertPersisted(target, content, id);
  }
  const rows = history(target);
  expect(new Set(rows.map((row) => row.version_id)).size).toBe(rows.length);
});

it('keeps the current head after a stale request snapshot is replayed', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  edit(source, '123');
  await withLibraryRequestSnapshot(source, target, async replayOld => {
    edit(source, '123456');
    const current = edit(source, '123456789');
    await withLibraryRequestSnapshot(source, target, async replayLatest => {
      await replayLatest(); await replayOld(); await replayLatest();
    });
    assertPersisted(target, '123456789', current);
  });
  const rows = history(target);
  expect(new Set(rows.map((row) => row.version_id)).size).toBe(rows.length);
});

it('keeps both complete offline texts and a two-parent resolution without merging their lines', async () => {
  const left = createPeer('left');
  const right = createPeer('right');
  joinPeers(left, right);
  edit(left, '123\n456\n789\n');
  await sync(left, right);
  const l = edit(left, '123-left\n456\n789\n');
  const r = edit(right, '123\n456\n789-right\n');
  await sync(right, left);
  const resolved = (await loadCurrentSyncNodeRecord(left.port, 'topic'))!;
  const merged = resolved.version_id!;
  expect(wholeBodies(resolved)).toEqual(new Set(['123-left\n456\n789\n', '123\n456\n789-right\n']));
  assertPersisted(left, resolved.body_text!, merged);
  expect((await loadMergeBase(left.port, merged, r))?.version_id).toBe(r);
  expect(left.db.prepare(`SELECT parent_version_id FROM node_sync_version_parents
    WHERE version_id = ? ORDER BY parent_version_id`).all(merged))
    .toEqual([l, r].sort().map((parent_version_id) => ({ parent_version_id })));
  await sync(left, right);
  assertPersisted(right, resolved.body_text!, merged);
  expect(wholeBodies((await loadCurrentSyncNodeRecord(right.port, 'topic'))!)).toEqual(wholeBodies(resolved));
  expect(right.db.prepare(`SELECT parent_version_id FROM node_sync_version_parents
    WHERE version_id = ? ORDER BY parent_version_id`).all(merged))
    .toEqual([l, r].sort().map((parent_version_id) => ({ parent_version_id })));
});

it('keeps the losing overlapping edit as a durable alternative and sends it to the other end', async () => {
  const left = createPeer('left');
  const right = createPeer('right');
  joinPeers(left, right);
  edit(left, '123');
  await sync(left, right);
  edit(left, '123456');
  edit(right, '123789');
  await sync(right, left);
  const resolved = (await loadCurrentSyncNodeRecord(left.port, 'topic'))!;
  expect(wholeBodies(resolved)).toEqual(new Set(['123456', '123789']));
  await sync(left, right);
  assertPersisted(right, resolved.body_text!, resolved.version_id!);
  expect(wholeBodies((await loadCurrentSyncNodeRecord(right.port, 'topic'))!)).toEqual(wholeBodies(resolved));
});

it('preserves the production chain and both complete texts from a lagging offline branch', async () => {
  const source = createPeer('source');
  const lagging = createPeer('lagging');
  joinPeers(source, lagging);
  const a = edit(source, '123\n456\n789\n');
  await sync(source, lagging);
  const b = edit(source, '123-middle\n456\n789\n');
  const c = edit(source, '123-current\n456\n789\n');
  expect(await collectNodeVersionPayloads(source.port, 'topic')).toEqual({ released: 0, skipped: null });
  expect(history(source).map(({ version_id }) => version_id)).toEqual([a, b, c]);
  const branch = edit(lagging, '123\n456\n789-offline\n');
  await sync(lagging, source);
  expect(history(source).find((row) => row.version_id === c)).toBeDefined();
  expect(history(source).find((row) => row.version_id === branch)).toBeDefined();
  const resolved = (await loadCurrentSyncNodeRecord(source.port, 'topic'))!;
  expect(wholeBodies(resolved)).toEqual(new Set(['123-current\n456\n789\n', '123\n456\n789-offline\n']));
  assertPersisted(source, resolved.body_text!, resolved.version_id!);
  await sync(source, lagging);
  assertPersisted(lagging, resolved.body_text!, resolved.version_id!);
  expect(wholeBodies((await loadCurrentSyncNodeRecord(lagging.port, 'topic'))!)).toEqual(wholeBodies(resolved));
  expect(history(lagging).find((row) => row.version_id === branch)).toBeDefined();
});
