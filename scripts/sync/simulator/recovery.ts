import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect } from 'vitest';

import { assertBody } from './assertions.js';
import { snapshotInput } from './input.js';
import { edit, mobileEdit } from './operations.js';
import { reopenPeer } from './peers.js';
import { converge, type ScenarioContext } from './scenarios.js';
import { mobileStore, pull, push } from './transport.js';

export async function lostPushResponse(ctx: ScenarioContext) {
  const base = edit(ctx.a, 'before', 'topic', { anchorLink: { id: 'shared', kind: 'highlight' } });
  await pull(ctx.sa, ctx.b);
  const version = await mobileEdit(ctx.b, base, 'after');
  ctx.sa.loseResponse = '/companion/sync-push';
  await expect(push(ctx.sa, ctx.b)).rejects.toThrow();
  expect(ctx.sa.loseResponse).toBeNull();
  assertBody(ctx.a, 'after', 'topic', version);
  reopenPeer(ctx.a);
  reopenPeer(ctx.b);
  expect((await mobileStore(ctx.b).loadNodeVersions(ctx.a.id, null)).map((row) => row.version_id)).toContain(version);
  await push(ctx.sa, ctx.b);
  await converge(ctx);
  assertBody(ctx.a, 'after', 'topic', version);
}
export async function walSnapshot(ctx: ScenarioContext) {
  ctx.a.sqlite.pragma('wal_autocheckpoint = 0');
  edit(ctx.a, 'before snapshot');
  edit(ctx.a, 'latest WAL edit');
  expect((await fs.stat(`${ctx.a.dbPath}-wal`)).size).toBeGreaterThan(0);
  const input = await snapshotInput(ctx.a.dbPath, ctx.a.assets, path.join(ctx.a.root, 'snapshot'));
  const snapshot = new Database(input.output, { readonly: true });
  try {
    expect(snapshot.prepare("SELECT content FROM nodes WHERE id='topic'").pluck().get()).toBe('latest WAL edit');
    expect(snapshot.pragma('quick_check')).toEqual([{ quick_check: 'ok' }]);
  } finally { snapshot.close(); }
  await converge(ctx);
}
