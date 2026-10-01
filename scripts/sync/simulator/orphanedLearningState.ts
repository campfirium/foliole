import { expect } from 'vitest';

import { upsertSyncObjectState } from '../../../lib/core/database/syncState.js';

import { assertBody } from './assertions.js';
import { assertLocalRootsPreserved, localRootRecords } from './localRootRecords.js';
import { edit } from './operations.js';
import { converge, type ScenarioContext } from './scenarios.js';

export async function orphanedLearningState(ctx: ScenarioContext) {
  // A retained state cursor may outlive its node and payload in an existing library.
  upsertSyncObjectState(ctx.a.driver, { objectType: 'node_reading', objectId: 'removed-node',
    contentHash: 'retained-state', lastModifiedByHostName: ctx.a.name, syncDirty: true,
    updatedAt: '2026-10-01T00:00:00.000Z' });
  edit(ctx.a, 'live body');
  await converge(ctx);
  assertBody(ctx.b, 'live body');
  expect(ctx.b.sqlite.prepare("SELECT id FROM nodes WHERE id='removed-node'").get()).toBeUndefined();
}

export async function unbackedLearningState(ctx: ScenarioContext) {
  for (let version = 0; version < 100; version++) edit(ctx.a, `retained body ${version}`, 'unopened');
  await converge(ctx);
  for (const objectType of ['node_open_state', 'node_review'] as const) {
    upsertSyncObjectState(ctx.a.driver, { objectType, objectId: 'unopened',
      contentHash: `retained-${objectType}`, lastModifiedByHostName: ctx.a.name, syncDirty: true,
      updatedAt: '2026-10-01T00:00:00.000Z' });
  }
  edit(ctx.a, 'live body');
  await converge(ctx);
  assertBody(ctx.b, 'retained body 99', 'unopened');
  assertBody(ctx.b, 'live body');
  expect(ctx.b.sqlite.prepare('SELECT * FROM node_open_state').all()).toEqual([]);
  expect(ctx.b.sqlite.prepare('SELECT * FROM node_review').all()).toEqual([]);
}

export async function tombstonedLearningState(ctx: ScenarioContext) {
  for (let version = 0; version < 100; version++) edit(ctx.a, `retained body ${version}`, 'retained');
  // Retained history can predate the current learning-state window in an existing library.
  ctx.a.driver.execute("UPDATE sync_object_state SET state_seq = 0 WHERE object_type = 'node' AND object_id = 'retained'");
  upsertSyncObjectState(ctx.a.driver, { objectType: 'node_reading', objectId: 'retained',
    contentHash: 'deleted-reading', lastModifiedByHostName: ctx.a.name, syncDirty: true,
    deletedAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
  edit(ctx.a, 'live body');
  await converge(ctx);
  assertBody(ctx.b, 'retained body 99', 'retained');
  expect(ctx.b.sqlite.prepare("SELECT deleted_at FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'retained'").pluck().get())
    .toBe('2026-10-01T00:00:00.000Z');
}

export async function localRootState(ctx: ScenarioContext) {
  // Seed independent local-root histories, as retained by legacy libraries.
  for (const peer of [ctx.a, ctx.b]) edit(peer, '', 'special-inbox', { kind: 'folder', title: 'Inbox' });
  edit(ctx.a, '', 'seed', { parentNodeId: 'special-inbox' });
  const before = [localRootRecords(ctx.a), localRootRecords(ctx.b)];
  await converge(ctx);
  assertLocalRootsPreserved(ctx.a, before[0]!);
  assertLocalRootsPreserved(ctx.b, before[1]!);
  assertBody(ctx.b, '', 'seed');
}
