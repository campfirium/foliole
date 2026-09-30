// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { loadMergeBase } from '../../lib/core/sync/syncNodeGraph.js';

import {
  assertPersisted, buildPack, closeLibraries, createPeer, edit, history, joinPeers,
  receivePack, startLibraries, sync
} from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('sends a production A-B-C history in a first full pack to an empty library', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const a = edit(source, '123');
  const b = edit(source, '123456');
  const c = edit(source, '123456789');
  await sync(source, target);
  for (const peer of [source, target]) {
    assertPersisted(peer, '123456789', c);
    expect(history(peer).map(({ version_id, parent_version_id, body_text }) =>
      [version_id, parent_version_id, body_text])).toEqual([[a, null, '123'], [b, a, '123456'], [c, b, '123456789']]);
  }
});

it('retains each production version through successive synchronization and duplicate replay', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  for (const content of ['123', '123456', '123456789']) {
    const id = edit(source, content);
    const pack = await sync(source, target);
    await receivePack(source, target, pack);
    assertPersisted(target, content, id);
  }
  expect(history(target)).toHaveLength(3);
});

it('ignores an older full pack after a newer pack and preserves all parent identities', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  edit(source, '123');
  const old = await buildPack(source, target);
  edit(source, '123456');
  const c = edit(source, '123456789');
  const latest = await buildPack(source, target);
  await receivePack(source, target, latest);
  await receivePack(source, target, old);
  await receivePack(source, target, latest);
  assertPersisted(target, '123456789', c);
  expect(history(target)).toHaveLength(3);
});

it('merges two offline edits from their production common base and persists a two-parent resolution on both ends', async () => {
  const left = createPeer('left');
  const right = createPeer('right');
  joinPeers(left, right);
  const base = edit(left, '123\n456\n789\n');
  await sync(left, right);
  const l = edit(left, '123-left\n456\n789\n');
  const r = edit(right, '123\n456\n789-right\n');
  await sync(right, left);
  const merged = history(left).at(-1)!.version_id;
  assertPersisted(left, '123-left\n456\n789-right\n', merged);
  expect((await loadMergeBase(left.port, l, r))?.version_id).toBe(base);
  expect(left.db.prepare(`SELECT parent_version_id FROM node_sync_version_parents
    WHERE version_id = ? ORDER BY parent_version_id`).all(merged))
    .toEqual([l, r].sort().map((id) => ({ parent_version_id: id })));
  await sync(left, right);
  assertPersisted(right, '123-left\n456\n789-right\n', merged);
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
  const body = loadNodeBodyResolution(left.driver, 'topic');
  if (body?.status !== 'resolved') throw new Error('winner_body_unavailable');
  const winner = body.content;
  const alternative = left.db.prepare("SELECT body_text FROM node_text_alternatives WHERE status = 'available'").pluck().get();
  expect([winner, alternative].sort()).toEqual(['123456', '123789']);
  await sync(left, right);
  assertPersisted(right, winner);
  expect(right.db.prepare("SELECT body_text FROM node_text_alternatives WHERE status = 'available'").pluck().get())
    .toBe(alternative);
});

it('collects only expendable production bodies after a real receipt then merges a lagging offline branch', async () => {
  const source = createPeer('source');
  const lagging = createPeer('lagging');
  joinPeers(source, lagging);
  const a = edit(source, '123\n456\n789\n');
  await sync(source, lagging);
  const b = edit(source, '123-middle\n456\n789\n');
  const c = edit(source, '123-current\n456\n789\n');
  expect(await collectNodeVersionPayloads(source.port, 'topic')).toEqual({ released: 1, skipped: null });
  expect(history(source).map(({ version_id, body_text }) => [version_id, body_text]))
    .toEqual([[a, '123\n456\n789\n'], [b, null], [c, '123-current\n456\n789\n']]);
  const branch = edit(lagging, '123\n456\n789-offline\n');
  await sync(lagging, source);
  expect((await loadMergeBase(source.port, branch, c))?.version_id).toBe(a);
  assertPersisted(source, '123-current\n456\n789-offline\n');
  await sync(source, lagging);
  assertPersisted(lagging, '123-current\n456\n789-offline\n');
  expect(history(lagging).find((row) => row.version_id === b)?.body_text).toBeNull();
  expect(history(lagging).find((row) => row.version_id === a)?.body_text).toBe('123\n456\n789\n');
});
