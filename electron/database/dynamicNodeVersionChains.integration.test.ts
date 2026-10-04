// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';

import { assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries, sync } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('retires only unsent intermediate bodies while preserving original facts and an offline base', async () => {
  const a = createPeer('a');
  const b = createPeer('b');
  joinPeers(a, b);
  const base = edit(a, 'base');
  await sync(a, b);
  const middle = edit(a, 'middle');
  const head = edit(a, 'head');
  await collectNodeVersionPayloads(a.port, 'topic');
  expect(history(a).map((row) => row.version_id)).toEqual([base, middle, head]);
  expect(history(a).map((row) => row.body_text)).toEqual(['base', null, 'head']);
  expect(history(a).map((row) => row.parent_version_id)).toEqual([null, base, middle]);
});

it('retains original metadata outside a group without accumulating intermediate bodies', () => {
  const a = createPeer('a');
  const versions = ['a', 'b', 'c', 'd'].map((body) => edit(a, body));
  expect(history(a).map((row) => row.version_id)).toEqual(versions);
  expect(history(a).map((row) => row.body_text)).toEqual([null, null, null, 'd']);
  expect(history(a).map((row) => row.parent_version_id)).toEqual([null, ...versions.slice(0, -1)]);
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
  const offline = edit(c, 'left\nright-offline\n');
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
    const versions = history(peer);
    expect(versions).toHaveLength(4);
    expect(versions.map((row) => row.version_id)).toEqual(expect.arrayContaining([base, online, offline]));
    expect(versions.find((row) => row.version_id === online)?.parent_version_id).toBe(base);
    expect(versions.find((row) => row.version_id === offline)?.parent_version_id).toBe(base);
    expect(versions.filter((row) => row.body_text !== null)).toHaveLength(1);
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
  const head = edit(a, 'd');
  expect(history(a).map((row) => row.body_text)).toEqual(['a', 'b', null, 'd']);
  expect(history(a).map((row) => row.version_id)).toEqual([first, second, third, head]);
  await sync(a, b);
  expect(history(a).map((row) => row.body_text)).toEqual(['a', null, null, 'd']);
  await sync(a, c);
  expect(history(a).map((row) => row.body_text)).toEqual([null, null, null, 'd']);
  expect(history(a).map((row) => row.parent_version_id)).toEqual([null, first, second, third]);
});
