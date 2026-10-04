import { expect } from 'vitest';

import { moveNodes } from '../../../electron/database/nodeMutations.js';

import { assertBody, graph } from './assertions.js';
import { edit, operations } from './operations.js';
import { reopenPeer } from './peers.js';
import { converge, type ScenarioContext } from './scenarios.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { pull } from './transport.js';

export async function sourceEditDuringSync(ctx: ScenarioContext) {
  const original = edit(ctx.a, 'body before sync');
  let edited: string | undefined;
  ctx.sa.afterResponse = (route) => {
    if (new URL(route, ctx.sa.origin).pathname !== '/companion/sync-pack-facts') return;
    delete ctx.sa.afterResponse;
    edited = edit(ctx.a, 'body edited during sync');
  };
  await pull(ctx.sa, ctx.b);
  expect(edited).toBeDefined();
  assertBody(ctx.a, 'body edited during sync', 'topic', edited);
  assertBody(ctx.b, 'body before sync', 'topic', original);
  await pull(ctx.sa, ctx.b);
  assertBody(ctx.b, 'body edited during sync', 'topic', edited);
  await converge(ctx);
}

export async function moveBetweenFolders(ctx: ScenarioContext) {
  for (const nodeId of ['folder-a', 'folder-b']) edit(ctx.a, '', nodeId, { kind: 'folder' });
  edit(ctx.a, 'unchanged article', 'article', { parentNodeId: 'folder-a' });
  await converge(ctx);
  const parent = (peer: SimulatorPeer) => peer.sqlite.prepare('SELECT parent_id FROM nodes WHERE id=?')
    .pluck().get('article');
  expect(parent(ctx.b)).toBe('folder-a');
  inPeer(ctx.a, () => moveNodes({ nodeOrder: ['folder-a', 'folder-b', 'article'],
    nodes: [{ nodeId: 'article', parentNodeId: 'folder-b', updatedAt: '2026-10-01T01:00:00Z' }] }));
  operations.push({ action: 'move', peer: ctx.a.name, nodeId: 'article', parentNodeId: 'folder-b' });
  await converge(ctx);
  for (const peer of [ctx.a, ctx.b]) {
    expect(parent(peer)).toBe('folder-b');
    expect(peer.sqlite.prepare("SELECT count(*) FROM nodes WHERE id='article'").pluck().get()).toBe(1);
    assertBody(peer, 'unchanged article', 'article');
  }
}

function businessState(peer: SimulatorPeer) {
  return { graph: graph(peer), sequence: peer.sqlite.prepare('SELECT * FROM sync_state_sequence').all(),
    objects: peer.sqlite.prepare('SELECT * FROM sync_object_state ORDER BY object_type,object_id').all() };
}

export async function unchangedReplay(ctx: ScenarioContext) {
  edit(ctx.a, 'unchanged article');
  await converge(ctx);
  const before = [businessState(ctx.a), businessState(ctx.b)];
  for (let round = 0; round < 3; round++) {
    if (round === 2) { reopenPeer(ctx.a); reopenPeer(ctx.b); }
    const start = ctx.sa.requests.length;
    await pull(ctx.sa, ctx.b);
    await pull(ctx.sb, ctx.a);
    expect([businessState(ctx.a), businessState(ctx.b)]).toEqual(before);
    expect(ctx.sa.requests.slice(start).filter((url) =>
      /^\/companion\/(content-blobs|attachment-resource)(\?|$)/.test(url))).toEqual([]);
  }
}
