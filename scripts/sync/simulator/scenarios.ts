import { expect } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { flushDesktopSyncGroupVersionReceipts } from '../../../electron/sync/desktopSyncGroupVersionReceipts.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { isStoredAncestorVersion, loadCurrentSyncNodeRecord } from '../../../lib/core/sync/syncNodeGraph.js';

import { assertBody, assertHealthy, assertCompleted, assertSharedVersionIdentities, convergenceState, graph } from './assertions.js';
import { edit, mobileEdit, remove } from './operations.js';
import { reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { mobileStore, pull, push, route, type Endpoint } from './transport.js';

export interface ScenarioContext {
  a: SimulatorPeer; b: SimulatorPeer; sa: Endpoint; sb: Endpoint;
  existingGaps?: readonly unknown[]; missingKeys?: ReadonlySet<string>;
}
export async function converge({ a, b, sa, sb, existingGaps = [], missingKeys = new Set<string>() }: ScenarioContext) {
  for (let round = 0; round < 8; round++) {
    await pull(sa, b, true, missingKeys);
    await pull(sb, a, true, missingKeys);
    if (JSON.stringify(convergenceState(a)) === JSON.stringify(convergenceState(b))) {
      const before = convergenceState(a);
      await pull(sa, b, true, missingKeys);
      await pull(sb, a, true, missingKeys);
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
  const acks = await push(sa, b, false);
  expect(acks[0]?.canonicalObjectId).toBeUndefined();
  if (overlap) {
    const initial = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(a.sqlite), 'topic');
    const alternatives = a.sqlite.prepare('SELECT body_text FROM node_text_alternatives').pluck().all();
    expect([initial!.body_text, ...alternatives]).toEqual(expect.arrayContaining(['023\nx=0\n', text]));
  }
  const tail = await mobileEdit(b, right, `${text}tail\n`);
  const store = mobileStore(b);
  await store.savePushAcks(a.id, acks);
  await store.savePushAcks(a.id, acks);
  assertBody(b, `${text}tail\n`, 'topic', tail);
  expect((await store.loadNodeVersions(a.id, null)).map((row) => row.version_id)).toContain(tail);
  await push(sa, b);
  await converge(ctx);
  const head = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(a.sqlite), 'topic');
  for (const ancestor of [base, left, right, tail].filter((id) => a.sqlite.prepare(
    'SELECT 1 FROM node_sync_versions WHERE version_id = ?').get(id))) {
    expect(await isStoredAncestorVersion(createBetterSqliteDbPort(a.sqlite), ancestor, head!.version_id!)).toBe(true);
  }
  if (!overlap) assertBody(a, '023\nx=1\ntail\n');
  else {
    const alternatives = a.sqlite.prepare('SELECT body_text FROM node_text_alternatives').pluck().all();
    expect([head!.body_text, ...alternatives]).toEqual(expect.arrayContaining(['023\nx=0\n', `${text}tail\n`]));
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
  edit(ctx.a, '123');
  if (process.env.FOLIOLE_SIM_PATH === 'companion') {
    ctx.sa.interrupt = { path: '/companion/version-pack-receipt', remaining: 1 };
    await expect(pull(ctx.sa, ctx.b, false)).rejects.toThrow();
    expect(ctx.sa.interrupt).toBeNull();
  } else await pull(ctx.sa, ctx.b, false);
  const next = edit(ctx.a, '123456');
  ctx.sa.interrupt = { path: '/companion/version-pack-receipt', remaining: 1 };
  const deliver = () => inPeer(ctx.b, () => flushDesktopSyncGroupVersionReceipts(route(ctx.sa, ctx.b)));
  await expect(deliver()).rejects.toThrow();
  await deliver();
  assertBody(ctx.a, '123456', 'topic', next);
  await pull(ctx.sa, ctx.b);
  await converge(ctx);
}
async function trimmed(ctx: ScenarioContext) {
  const base = edit(ctx.a, '123');
  await pull(ctx.sa, ctx.b);
  const intermediate = edit(ctx.a, '123456');
  const head = edit(ctx.a, '123456789');
  const collected = await collectNodeVersionPayloads(createBetterSqliteDbPort(ctx.a.sqlite), 'topic');
  expect(collected.released).toBe(0);
  expect(ctx.a.sqlite.prepare('SELECT 1 FROM node_sync_versions WHERE version_id=?').get(intermediate)).toBeUndefined();
  expect(ctx.a.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id=?').pluck().get(head)).toBe('123456789');
  await mobileEdit(ctx.b, base, '923');
  await push(ctx.sa, ctx.b);
  await converge(ctx);
}
async function interrupted(ctx: ScenarioContext) {
  const count = Number(process.env.FOLIOLE_SIM_SCALE ?? '1') * 150;
  for (let i = 0; i < count; i++) edit(ctx.a, `body-${i}`, `page-${i}`);
  for (let i = 0; i < 140; i++) edit(ctx.a, `history-${i}`, 'history');
  ctx.sa.interrupt = { path: '/companion/sync-pack', remaining: 2 };
  await expect(pull(ctx.sa, ctx.b)).rejects.toThrow();
  expect(ctx.sa.interrupt).toBeNull();
  const staged = ctx.b.sqlite.prepare('SELECT COUNT(*) FROM sync_pack_dependency_rows').pluck().get();
  expect(Number(staged)).toBeGreaterThan(0);
  reopenPeer(ctx.a);
  reopenPeer(ctx.b);
  await pull(ctx.sa, ctx.b);
  expect(ctx.sa.requests.filter((url) => url.startsWith('/companion/sync-pack?')).length).toBeGreaterThan(2);
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
  edit(ctx.a, 'desktop independent', 'topic', { kind: 'item' });
  const first = edit(ctx.b, 'mobile independent', 'topic', { kind: 'item' });
  const acks = await push(ctx.sa, ctx.b, false);
  expect(acks[0]?.canonicalObjectId).toBeTruthy();
  const next = edit(ctx.b, 'mobile later', 'topic', { kind: 'item' });
  const canonical = acks[0]!.canonicalObjectId!;
  const store = mobileStore(ctx.b);
  await store.savePushAcks(ctx.a.id, acks);
  await store.savePushAcks(ctx.a.id, acks);
  assertBody(ctx.b, 'mobile later', canonical, next);
  expect(ctx.b.sqlite.prepare('SELECT version_id FROM node_sync_versions WHERE object_id=?').pluck().all(canonical))
    .toEqual(expect.arrayContaining([first, next]));
  expect((await store.loadNodeVersions(ctx.a.id, null)).map((row) => row.version_id)).toContain(next);
  await push(ctx.sa, ctx.b);
  await converge(ctx);
  assertBody(ctx.a, 'mobile later', canonical);
  assertBody(ctx.a, 'desktop independent');
  const before = graph(ctx.b);
  await store.savePushAcks(ctx.a.id, acks);
  expect(graph(ctx.b)).toEqual(before);
  assertBody(ctx.b, 'desktop independent');
  assertBody(ctx.b, 'mobile later', canonical);
}
export const scenarios: Record<string, (ctx: ScenarioContext) => Promise<void>> = {
  continuous, merge: (ctx) => branches(ctx, false), conflict: (ctx) => branches(ctx, true),
  kinds, 'delayed-receipt': delayedPack, trimmed, 'paged-restart': interrupted, deletion, collision
};
