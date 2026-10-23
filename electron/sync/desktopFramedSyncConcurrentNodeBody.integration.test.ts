// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

type Kind = 'folder' | 'item';
type Edit = Readonly<{ content: string; title: string }>;

const base: Edit = { content: 'Base body', title: 'Base title' };

function persisted(databasePath: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const node = db.prepare(`SELECT n.content, n.title, v.body_text FROM nodes n
      JOIN node_sync_versions v ON v.version_id = n.current_version_id WHERE n.id = 'card'`).get();
    const bodies = db.prepare(`SELECT DISTINCT body_text FROM node_sync_versions
      WHERE object_id = 'card' AND body_text IS NOT NULL`).pluck().all();
    return { node, bodies: new Set(bodies) };
  } finally { db.close(); }
}

async function settle(...[process, peer]: Parameters<typeof reconnectFixturePeer>) {
  let round: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    round = await reconnectFixturePeer(process, peer);
    if ((round as { complete?: boolean }).complete) return;
  }
  throw new Error(`sync_rounds_incomplete:${JSON.stringify(round)}`);
}

async function converge(left: Edit, right: Edit, kind: Kind) {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    await fixture.left.seed({ ...base, kind, nodeId: 'card', updatedAt: '2026-10-23T01:00:00.000Z' });
    await settle(fixture.left, fixture.rightSnapshot);
    expect(persisted(fixture.rightSnapshot.databasePath).node).toMatchObject(base);
    await fixture.left.seed({ ...left, kind, nodeId: 'card', updatedAt: '2026-10-23T02:00:00.000Z' });
    await fixture.right.seed({ ...right, kind, nodeId: 'card', updatedAt: '2026-10-23T03:00:00.000Z' });
    await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
    await settle(fixture.left, fixture.rightSnapshot);
    return {
      left: persisted(fixture.leftSnapshot.databasePath),
      right: persisted(fixture.rightSnapshot.databasePath)
    };
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}

it.each(['item', 'folder'] as const)('keeps one side body edit and the other side title edit on a %s', async (kind) => {
  const result = await converge({ ...base, content: 'Left body' }, { ...base, title: 'Right title' }, kind);
  const expected = { content: 'Left body', title: 'Right title', body_text: 'Left body' };
  expect(result.left.node).toEqual(expected);
  expect(result.right.node).toEqual(expected);
}, 120_000);

it('picks a both-sides item body by the article rule and keeps the other body recoverable', async () => {
  const result = await converge({ ...base, content: 'Left body' }, { ...base, content: 'Right body' }, 'item');
  const expected = { content: 'Right body', title: 'Base title', body_text: 'Right body' };
  expect(result.left.node).toEqual(expected);
  expect(result.right.node).toEqual(expected);
  for (const side of [result.left, result.right]) {
    expect(side.bodies.has('Left body') && side.bodies.has('Right body')).toBe(true);
  }
}, 120_000);

it('converges an identical concurrent item edit without losing the body', async () => {
  const edit = { content: 'Same body', title: 'Same title' };
  const result = await converge(edit, edit, 'item');
  const expected = { ...edit, body_text: 'Same body' };
  expect(result.left.node).toEqual(expected);
  expect(result.right.node).toEqual(expected);
}, 120_000);
