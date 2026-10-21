// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess } from './desktopFramedSyncTwoProcess.testSupport.js';

const NODE_ID = 'history-cleanup';

function versions(databasePath: string) {
  const db = new Database(databasePath, { readonly: true });
  try {
    return db.prepare(`SELECT version_id, parent_version_id, body_text IS NOT NULL AS has_body
      FROM node_sync_versions WHERE object_id = ? ORDER BY created_at, version_id`).all(NODE_ID) as
      Array<{ has_body: number; parent_version_id: string | null; version_id: string }>;
  } finally { db.close(); }
}

function currentBody(databasePath: string) {
  const db = new Database(databasePath, { readonly: true });
  try {
    return db.prepare(`SELECT version.body_text FROM nodes node JOIN node_sync_versions version
      ON version.version_id = node.current_version_id WHERE node.id = ?`).pluck().get(NODE_ID);
  } finally { db.close(); }
}

/** Object pulls and pushes the responder served; zero means the round moved no history. */
async function objectTransfers(responder: DesktopFramedSyncFixtureProcess) {
  const counts = await responder.invoke('request_counts') as Record<string, number>;
  return ['pull', 'pulls', 'object', 'objects'].reduce((sum, label) => sum + (counts[label] ?? 0), 0);
}

/** Stand-in for the planned background cleanup: drop bodyless superseded version records locally. */
function cleanSupersededHistory(databasePath: string) {
  const db = new Database(databasePath);
  try {
    return db.prepare(`DELETE FROM node_sync_versions WHERE object_id = ? AND body_text IS NULL
      AND version_id <> (SELECT current_version_id FROM nodes WHERE id = ?)`).run(NODE_ID, NODE_ID).changes;
  } finally { db.close(); }
}

async function withHistory(run: (fixture: Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>) => Promise<void>) {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    for (const content of ['Draft one', 'Draft two', 'Draft three']) {
      await fixture.left.seed({ content, nodeId: NODE_ID, title: 'History cleanup' });
    }
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    expect(versions(fixture.rightSnapshot.databasePath)).toEqual(versions(fixture.leftSnapshot.databasePath));
    expect(versions(fixture.leftSnapshot.databasePath).filter(version => !version.has_body)).toHaveLength(2);
    await run(fixture);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}

it('keeps locally cleaned history out of the next comparison', async () => withHistory(async fixture => {
  const before = versions(fixture.rightSnapshot.databasePath);
  expect(cleanSupersededHistory(fixture.leftSnapshot.databasePath)).toBe(2);
  const transfers = await objectTransfers(fixture.right);
  expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });

  expect(await objectTransfers(fixture.right) - transfers).toBe(0);
  expect(versions(fixture.leftSnapshot.databasePath).map(version => version.version_id))
    .toEqual([before.at(-1)!.version_id]);
  expect(versions(fixture.rightSnapshot.databasePath)).toEqual(before);
}), 60_000);

it('still synchronizes a later edit after one side cleaned its history', async () => withHistory(async fixture => {
  cleanSupersededHistory(fixture.leftSnapshot.databasePath);
  await fixture.right.seed({ content: 'Edited on the other device', nodeId: NODE_ID, title: 'History cleanup' });
  expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });

  expect(currentBody(fixture.leftSnapshot.databasePath)).toBe('Edited on the other device');
  const left = await readFixtureInventory(fixture.left);
  const right = await readFixtureInventory(fixture.right);
  expect(left.find(entry => entry.globalId === NODE_ID)?.currentVersionId)
    .toBe(right.find(entry => entry.globalId === NODE_ID)?.currentVersionId);
  const transfers = await objectTransfers(fixture.right);
  expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  expect(await objectTransfers(fixture.right) - transfers).toBe(0);
}), 60_000);
