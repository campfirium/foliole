// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { writeNodeOpenStateWithSync } from '../../lib/core/database/nodeOpenState.js';
import { deleteNodesPermanently } from '../../lib/core/database/nodePermanentDeleteMutations.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { createBetterSqlite3Driver } from '../database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it.each([false, true])('keeps ordinary HTTP synchronization working after an opened topic is deleted, historical residue=%s', async (historicalResidue) => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  const nodeId = 'deleted-open-topic';
  const leftRound = { input: { kind: 'reconcile', peer: { deviceId: fixture.rightSnapshot.deviceId,
    libraryEpoch: 'desktop-b-epoch' }, peerOrigin: fixture.rightSnapshot.origin } };
  try {
    await fixture.left.seed({ content: 'Protected complete original body', nodeId, title: 'Opened topic' });
    await fixture.left.invoke('round', leftRound);
    const previousOpenState = await prepareDeletion(fixture, nodeId);
    await fixture.left.invoke('round', leftRound);
    await expectDeletedState(fixture.rightSnapshot.databasePath, nodeId, historicalResidue, previousOpenState);
    await fixture.right.seed({ content: 'New saved body after deletion. 中文 😀.', nodeId: 'next-topic', title: 'Next topic' });
    const rightRound = { input: { kind: 'reconcile', peer: { deviceId: fixture.leftSnapshot.deviceId,
      libraryEpoch: 'desktop-a-epoch' }, peerOrigin: fixture.leftSnapshot.origin } };
    await fixture.right.invoke('round', rightRound);
    await expect(fixture.right.invoke('round', rightRound)).resolves.toMatchObject({ complete: true });
    await fixture.restartLeft();
    await fixture.restartRight();
    for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      const reopened = new Database(snapshot.databasePath, { readonly: true });
      try {
        expect(reopened.prepare("SELECT content FROM nodes WHERE id = 'next-topic'").pluck().get())
          .toBe('New saved body after deletion. 中文 😀.');
        expect(reopened.prepare('SELECT node_id FROM node_sync_tombstones WHERE node_id = ?').get(nodeId))
          .toEqual({ node_id: nodeId });
      } finally { reopened.close(); }
    }
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);

async function prepareDeletion(fixture: Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>, nodeId: string) {
  const receiver = new Database(fixture.rightSnapshot.databasePath);
  let previousOpenState: unknown;
  try {
    writeNodeOpenStateWithSync(createBetterSqlite3Driver(receiver), {
      hostName: 'desktop-b', lastOpenedAt: '2026-10-10T00:00:00.000Z', nodeId
    });
    previousOpenState = receiver.prepare("SELECT * FROM sync_object_state WHERE object_type = 'node_open_state' AND object_id = ?").get(nodeId);
    await expect(readFramedSyncInventoryEntry(createBetterSqliteDbPort(receiver), {
      globalId: nodeId, objectType: 'node_open_state'
    })).resolves.toMatchObject({ globalId: nodeId });
  } finally { receiver.close(); }
  const source = new Database(fixture.leftSnapshot.databasePath);
  try {
    const driver = createBetterSqlite3Driver(source);
    source.exec("ATTACH DATABASE ':memory:' AS search");
    initializeWorkspaceSearchSidecar({ sqlite: source, driver });
    deleteNodesPermanently(driver, { nodeIds: [nodeId], nodeOrder: [],
      deletedAt: '2026-10-10T00:01:00.000Z' });
  } finally { source.close(); }
  return previousOpenState;
}

async function expectDeletedState(databasePath: string, nodeId: string, historicalResidue: boolean, previousOpenState: unknown) {
  const deleted = new Database(databasePath);
  try {
    expect(deleted.prepare('SELECT id FROM nodes WHERE id = ?').get(nodeId)).toBeUndefined();
    if (historicalResidue) {
      const state = previousOpenState;
      if (!state || typeof state !== 'object') throw new Error('open_state_fixture_missing');
      const columns = Object.keys(state);
      deleted.prepare(`INSERT OR REPLACE INTO sync_object_state (${columns.join(',')})
        VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(state));
    } else {
      expect(deleted.prepare("SELECT * FROM sync_object_state WHERE object_type = 'node_open_state' AND object_id = ?")
        .get(nodeId)).toBeUndefined();
    }
    await expect(readFramedSyncInventoryEntry(createBetterSqliteDbPort(deleted), {
      globalId: nodeId, objectType: 'node_open_state'
    })).resolves.toBeNull();
    expect(deleted.prepare('SELECT body_text FROM node_sync_versions WHERE object_id = ?').pluck().all(nodeId))
      .toContain('Protected complete original body');
  } finally { deleted.close(); }
}
