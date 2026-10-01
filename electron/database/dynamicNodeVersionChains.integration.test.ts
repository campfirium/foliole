// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';

import { assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries, sync } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('retires whole unsent intermediate versions while preserving an offline complete base', async () => {
  const a = createPeer('a');
  const b = createPeer('b');
  joinPeers(a, b);
  const base = edit(a, 'base');
  await sync(a, b);
  const middle = edit(a, 'middle');
  const head = edit(a, 'head');
  await collectNodeVersionPayloads(a.port, 'topic');
  expect(history(a).map((row) => row.version_id)).toEqual([base, head]);
  expect(history(a).find((row) => row.version_id === middle)).toBeUndefined();
  expect(history(a).every((row) => row.body_text !== null)).toBe(true);
});

it('does not accumulate sync history outside a group', () => {
  const a = createPeer('a');
  for (const body of ['a', 'b', 'c', 'd']) edit(a, body);
  expect(history(a).map((row) => [row.body_text, row.parent_version_id])).toEqual([['d', null]]);
});

it('forwards the complete retained old base and merges a third offline device without forwarding device proofs', async () => {
  const a = createPeer('a');
  const b = createPeer('b');
  const c = createPeer('c');
  joinPeers(a, b, c);
  const base = edit(a, 'left\nright\n');
  await sync(a, c);
  const online = edit(a, 'left-online\nright\n');
  await sync(a, b);
  expect(history(b).map((row) => row.version_id)).toEqual([base, online]);
  expect(b.db.prepare('SELECT device_identity_key FROM node_version_device_bases').pluck().all()).toEqual([a.id]);
  edit(c, 'left\nright-offline\n');
  await sync(b, c);
  assertPersisted(c, 'left-online\nright-offline\n');
  await sync(c, b);
  await sync(b, a);
  await sync(a, c);
  await sync(a, b);
  await sync(c, a);
  await sync(b, c);
  for (const peer of [a, b, c]) {
    assertPersisted(peer, 'left-online\nright-offline\n');
    expect(history(peer)).toHaveLength(1);
    expect(history(peer)[0]?.parent_version_id).toBeNull();
  }
});

it('keeps distinct direct device bases until each lagging device advances', async () => {
  const a = createPeer('a');
  const b = createPeer('b');
  const c = createPeer('c');
  joinPeers(a, b, c);
  const first = edit(a, 'a');
  await sync(a, c);
  const second = edit(a, 'b');
  await sync(a, b);
  const third = edit(a, 'c');
  edit(a, 'd');
  expect(history(a).map((row) => row.body_text)).toEqual(['a', 'b', 'd']);
  expect(history(a).find((row) => row.version_id === third)).toBeUndefined();
  await sync(a, b);
  expect(history(a).map((row) => row.body_text)).toEqual(['a', 'd']);
  expect(history(a).find((row) => row.version_id === second)).toBeUndefined();
  await sync(a, c);
  expect(history(a).find((row) => row.version_id === first)).toBeUndefined();
  expect(history(a).map((row) => row.body_text)).toEqual(['d']);
});
