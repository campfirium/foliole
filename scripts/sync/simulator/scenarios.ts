import { expect } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { isStoredAncestorVersion, loadCurrentSyncNodeRecord } from '../../../lib/core/sync/syncNodeGraph.js';
import { validateTopicTextBodies } from '../../../lib/core/sync/topicTextBodies.js';

import { assertBody, assertHealthy, assertCompleted, assertSharedVersionIdentities, convergenceState, graph } from './assertions.js';
import { edit, mobileEdit, remove } from './operations.js';
import { reopenPeer } from './peers.js';
import { type SimulatorPeer } from './scope.js';
import { pull, push, type Endpoint } from './transport.js';

export interface ScenarioContext {
  a: SimulatorPeer; b: SimulatorPeer; sa: Endpoint; sb: Endpoint;
  existingGaps?: readonly unknown[]; missingKeys?: ReadonlySet<string>;
}
export async function converge({ a, b, sa, sb, existingGaps = [], missingKeys = new Set<string>() }: ScenarioContext) {
  for (let round = 0; round < 8; round++) {
    await pull(sa, b, missingKeys);
    await pull(sb, a, missingKeys);
    if (JSON.stringify(convergenceState(a)) === JSON.stringify(convergenceState(b))) {
      const before = convergenceState(a);
      await pull(sa, b, missingKeys);
      await pull(sb, a, missingKeys);
      expect(convergenceState(a)).toEqual(before);
      expect(convergenceState(b)).toEqual(before);
      assertSharedVersionIdentities(a, b);
      assertHealthy(a, existingGaps);
      assertHealthy(b, existingGaps);
      await assertCompleted(a, missingKeys);
      await assertCompleted(b, missingKeys);
      return;
    }
  }
  throw new Error('simulator_convergence_failed');
}
async function continuous(ctx: ScenarioContext) {
  edit(ctx.a, '123');
  edit(ctx.a, '123456');
  const c = edit(ctx.a, '123456789');
  await pull(ctx.sa, ctx.b);
  assertBody(ctx.b, '123456789', 'topic', c);
  await converge(ctx);
}
async function branches(ctx: ScenarioContext, overlap: boolean) {
  const { a, b, sa } = ctx;
  const base = edit(a, '123\nx=0\n', 'topic', { anchorLink: { id: 'shared', kind: 'highlight' } });
  await pull(sa, b);
  const left = edit(a, '023\nx=0\n', 'topic', { anchorLink: { id: 'shared', kind: 'highlight' } });
  const text = overlap ? '923\nx=0\n' : '123\nx=1\n';
  const right = await mobileEdit(b, base, text);
  await push(sa, b);
  for (const peer of [a, b]) {
    const initial = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(peer.sqlite), 'topic');
    const alternatives = validateTopicTextBodies(initial!.snapshot.text_alternatives ?? [], initial!.alternative_bodies ?? []);
    expect([initial!.body_text, ...alternatives.map(body => body.text)])
      .toEqual(expect.arrayContaining(['023\nx=0\n', text]));
  }
  const current = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(b.sqlite), 'topic');
  const tailText = `${current!.body_text}tail\n`;
  const tail = await mobileEdit(b, current!.version_id!, tailText);
  assertBody(b, tailText, 'topic', tail);
  expect(b.sqlite.prepare('SELECT version_id FROM node_sync_versions').pluck().all()).toContain(tail);
  await push(sa, b);
  await converge(ctx);
  const head = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(a.sqlite), 'topic');
  for (const ancestor of [base, left, right, tail].filter((id) => a.sqlite.prepare(
    'SELECT 1 FROM node_sync_versions WHERE version_id = ?').get(id))) {
    expect(await isStoredAncestorVersion(createBetterSqliteDbPort(a.sqlite), ancestor, head!.version_id!)).toBe(true);
  }
  for (const peer of [a, b]) {
    const final = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(peer.sqlite), 'topic');
    const alternatives = validateTopicTextBodies(final!.snapshot.text_alternatives ?? [], final!.alternative_bodies ?? []);
    expect([final!.body_text, ...alternatives.map(body => body.text)])
      .toEqual(expect.arrayContaining(['023\nx=0\n', tailText]));
  }
}
async function kinds(ctx: ScenarioContext) {
  for (const kind of ['folder', 'item', 'topic'] as const) {
    const id = `kind-${kind}`;
    const content = kind === 'folder' ? '' : `body-${kind}`;
    edit(ctx.a, content, id, { kind, ...(kind === 'folder' ? {} : { parentNodeId: 'kind-folder' }) });
  }
  edit(ctx.a, 'anchored', 'anchored', { anchorLink: { id: 'anchor-1', kind: 'highlight' } });
  await converge(ctx);
  for (const kind of ['folder', 'item', 'topic']) {
    expect(ctx.b.sqlite.prepare('SELECT kind FROM nodes WHERE id=?').pluck().get(`kind-${kind}`)).toBe(kind);
  }
  expect(JSON.parse(ctx.b.sqlite.prepare("SELECT anchor_link FROM nodes WHERE id='anchored'").pluck().get() as string)).toEqual({ id: 'anchor-1', kind: 'highlight' });
}
async function delayedPack(ctx: ScenarioContext) {
  const original = edit(ctx.a, '123');
  ctx.sa.loseResponse = '/companion/framed-sync?request=round_finish';
  await Promise.allSettled([pull(ctx.sa, ctx.b)]);
  expect(ctx.sa.loseResponse).toBeNull();
  assertBody(ctx.b, '123', 'topic', original);
  const next = edit(ctx.a, '123456');
  reopenPeer(ctx.a);
  reopenPeer(ctx.b);
  await pull(ctx.sa, ctx.b);
  assertBody(ctx.a, '123456', 'topic', next);
  assertBody(ctx.b, '123456', 'topic', next);
  await converge(ctx);
}
async function trimmed(ctx: ScenarioContext) {
  const base = edit(ctx.a, '123');
  await pull(ctx.sa, ctx.b);
  const intermediate = edit(ctx.a, '123456');
  const head = edit(ctx.a, '123456789');
  const collected = await collectNodeVersionPayloads(createBetterSqliteDbPort(ctx.a.sqlite), 'topic');
  expect(collected.released).toBe(0);
  expect(ctx.a.sqlite.prepare(`SELECT object_id, parent_version_id, body_text,
    json_type(snapshot_json, '$.content') AS content_type FROM node_sync_versions WHERE version_id=?`)
    .get(intermediate)).toEqual({ object_id: 'topic', parent_version_id: base,
      body_text: null, content_type: 'null' });
  for (const [version, parent] of [[intermediate, base], [head, intermediate]]) {
    expect(ctx.a.sqlite.prepare(`SELECT 1 FROM node_sync_version_parents
      WHERE version_id=? AND parent_version_id=?`).get(version, parent)).toBeDefined();
  }
  expect(ctx.a.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id=?').pluck().get(head)).toBe('123456789');
  await mobileEdit(ctx.b, base, '923');
  await push(ctx.sa, ctx.b);
  await converge(ctx);
}
async function interrupted(ctx: ScenarioContext) {
  const count = Number(process.env.FOLIOLE_SIM_SCALE ?? '1') * 150;
  for (let i = 0; i < count; i++) edit(ctx.a, `body-${i}`, `page-${i}`);
  for (let i = 0; i < 140; i++) edit(ctx.a, `history-${i}`, 'history');
  ctx.sa.interrupt = { path: '/companion/framed-sync?request=pulls', remaining: 1 };
  await Promise.allSettled([pull(ctx.sa, ctx.b)]);
  expect(ctx.sa.interrupt).toBeNull();
  assertHealthy(ctx.b);
  for (const row of ctx.b.sqlite.prepare('SELECT id FROM nodes WHERE id LIKE ?').all('page-%') as { id: string }[]) {
    assertBody(ctx.b, `body-${row.id.slice(5)}`, row.id);
  }
  reopenPeer(ctx.a);
  reopenPeer(ctx.b);
  await pull(ctx.sa, ctx.b);
  expect(ctx.sa.requests.filter(url => new URL(url, ctx.sa.origin).searchParams.get('request') === 'pulls').length).toBeGreaterThan(1);
  for (let i = 0; i < count; i++) assertBody(ctx.b, `body-${i}`, `page-${i}`);
  assertBody(ctx.b, 'history-139', 'history');
  await converge(ctx);
}
async function deletion(ctx: ScenarioContext) {
  edit(ctx.a, 'delete me');
  await pull(ctx.sa, ctx.b);
  remove(ctx.a);
  await converge(ctx);
  expect(ctx.b.sqlite.prepare("SELECT deleted_at FROM nodes WHERE id='topic'").pluck().get()).toBeTruthy();
}
async function collision(ctx: ScenarioContext) {
  const left = edit(ctx.a, 'desktop independent', 'topic', { kind: 'item', title: 'Desktop item' });
  const right = edit(ctx.b, 'mobile independent', 'topic', { kind: 'item', title: 'Mobile item' });
  const roots = [ctx.a, ctx.b].map(peer => peer.sqlite.prepare(
    'SELECT version_id, content_hash, parent_version_id FROM node_sync_versions WHERE object_id=?'
  ).get('topic'));
  await push(ctx.sa, ctx.b);
  for (const peer of [ctx.a, ctx.b]) {
    expect(peer.sqlite.prepare('SELECT id, kind, title FROM nodes WHERE id=?').all('topic'))
      .toEqual([{ id: 'topic', kind: 'item', title: 'Mobile item' }]);
    assertBody(peer, 'mobile independent');
    const head = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(peer.sqlite), 'topic');
    expect(head!.snapshot.text_alternatives ?? []).toEqual([]);
    for (const root of roots) expect(peer.sqlite.prepare(
      'SELECT version_id, content_hash, parent_version_id FROM node_sync_versions WHERE version_id=?'
    ).get((root as { version_id: string }).version_id)).toEqual(root);
    for (const version of [left, right]) expect(await isStoredAncestorVersion(
      createBetterSqliteDbPort(peer.sqlite), version, head!.version_id!
    )).toBe(true);
  }
  const next = edit(ctx.b, 'mobile later', 'topic', { kind: 'item', title: 'Continued item' });
  await push(ctx.sa, ctx.b);
  await converge(ctx);
  const before = graph(ctx.b);
  reopenPeer(ctx.a);
  reopenPeer(ctx.b);
  await converge(ctx);
  expect(graph(ctx.b)).toEqual(before);
  for (const peer of [ctx.a, ctx.b]) assertBody(peer, 'mobile later', 'topic', next);
}
export const scenarios: Record<string, (ctx: ScenarioContext) => Promise<void>> = {
  continuous, merge: (ctx) => branches(ctx, false), conflict: (ctx) => branches(ctx, true),
  kinds, 'delayed-receipt': delayedPack, trimmed, 'paged-restart': interrupted, deletion, collision
};
