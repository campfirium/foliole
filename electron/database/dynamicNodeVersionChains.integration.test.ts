// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { assertPersisted, closeLibraries, createPeer, edit, history, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { syncRequestLibrary as sync } from './syncRequestLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('retires ancestor body copies while preserving original facts and the offline current version', async () => {
  const a = createPeer('a');
  const b = createPeer('b');
  joinPeers(a, b);
  const base = edit(a, 'base');
  await sync(a, b);
  const middle = edit(a, 'middle');
  const head = edit(a, 'head');
  await collectNodeVersionPayloads(a.port, 'topic');
  expect(history(a).map((row) => row.version_id)).toEqual([base, middle, head]);
  expect(history(a).map((row) => row.body_text)).toEqual([null, null, 'head']);
  expect(history(b).map(row => row.body_text)).toEqual(['base']);
  expect(history(a).map((row) => row.parent_version_id)).toEqual([null, base, middle]);
});

it('retains original metadata outside a group without accumulating intermediate bodies', () => {
  const a = createPeer('a');
  const versions = ['a', 'b', 'c', 'd'].map((body) => edit(a, body));
  expect(history(a).map((row) => row.version_id)).toEqual(versions);
  expect(history(a).map((row) => row.body_text)).toEqual([null, null, null, 'd']);
  expect(history(a).map((row) => row.parent_version_id)).toEqual([null, ...versions.slice(0, -1)]);
});

it('forwards original lineage and merges complete input from a third offline device', async () => {
  const a = createPeer('a');
  const b = createPeer('b');
  const c = createPeer('c');
  joinPeers(a, b, c);
  const base = edit(a, 'left\nright\n');
  await sync(a, c);
  const online = edit(a, 'left-online\nright\n');
  await sync(a, b);
  expect(history(b).map((row) => row.version_id)).toEqual([base, online]);
  const offline = edit(c, 'left\nright-offline\n');
  await sync(b, c);
  const selected = (await loadCurrentSyncNodeRecord(c.port, 'topic'))!;
  expect(new Set([selected.body_text, ...(selected.alternative_bodies ?? []).map((entry) => entry.text)]))
    .toEqual(new Set(['left-online\nright\n', 'left\nright-offline\n']));
  assertPersisted(c, selected.body_text!);
  await sync(c, b);
  await sync(b, a);
  await sync(a, c);
  await sync(a, b);
  await sync(c, a);
  await sync(b, c);
  for (const peer of [a, b, c]) {
    assertPersisted(peer, selected.body_text!);
    const current = (await loadCurrentSyncNodeRecord(peer.port, 'topic'))!;
    expect(new Set([current.body_text, ...(current.alternative_bodies ?? []).map((entry) => entry.text)]))
      .toEqual(new Set(['left-online\nright\n', 'left\nright-offline\n']));
    const versions = history(peer);
    expect(versions).toHaveLength(4);
    expect(versions.map((row) => row.version_id)).toEqual(expect.arrayContaining([base, online, offline]));
    expect(versions.find((row) => row.version_id === online)?.parent_version_id).toBe(base);
    expect(versions.find((row) => row.version_id === offline)?.parent_version_id).toBe(base);
    expect(versions.filter((row) => row.body_text !== null)).toHaveLength(1);
  }
});

it('keeps distinct member positions until each lagging device advances', async () => {
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
  expect(history(a).map((row) => row.body_text)).toEqual([null, null, null, 'd']);
  expect(history(a).map((row) => row.version_id)).toEqual([first, second, third, head]);
  expect(history(b).at(-1)?.version_id).toBe(second);
  expect(history(c).at(-1)?.version_id).toBe(first);
  await sync(a, b);
  expect(history(a).map((row) => row.body_text)).toEqual([null, null, null, 'd']);
  await sync(a, c);
  expect(history(a).map((row) => row.body_text)).toEqual([null, null, null, 'd']);
  expect(history(a).map((row) => row.parent_version_id)).toEqual([null, first, second, third]);
});
