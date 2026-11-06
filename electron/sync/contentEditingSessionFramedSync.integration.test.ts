// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, type DesktopFramedSyncFixtureProcess } from './desktopFramedSyncTwoProcess.testSupport.js';

const nodeId = 'continuous-editor';
const baseBody = 'Base 中😀\r\nLast\r\n';
const localBody = (step: number) => `Local ${step}\r\n${baseBody}`;
const remoteBody = `Remote\r\n${baseBody}`;

async function read(databasePath: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const current = (await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(sqlite), nodeId))!;
    const alternatives = sqlite.prepare<[string], { body_text: string }>(
      "SELECT body_text FROM node_text_alternatives WHERE node_id = ? AND status = 'available'").all(nodeId);
    const parents = sqlite.prepare<[string], { version_id: string; parent_version_id: string; ordinal: number }>(
      `SELECT p.* FROM node_sync_version_parents p JOIN node_sync_versions v USING (version_id)
       WHERE v.object_id = ? ORDER BY p.version_id, p.ordinal`).all(nodeId);
    const holds = sqlite.prepare('SELECT * FROM node_version_local_holds WHERE object_id = ?').all(nodeId);
    return { current, bodies: new Set([current.body_text, ...alternatives.map(row => row.body_text)]), parents, holds };
  } finally { sqlite.close(); }
}

function save(peer: DesktopFramedSyncFixtureProcess, baseVersionId: string, baseContent: string,
  versionId: string, content: string, second: number) {
  return peer.invoke('local_content_edit', { nodeId, baseVersionId, baseContent, versionId, content,
    hostName: 'editor', updatedAt: `2026-11-06T01:00:0${second}.000Z` });
}

it('keeps sending its live edit branch across returned resolutions and converges only after exit',
  { meta: { calibratedMs: 60_000 } }, async () => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
    let succeeded = false;
    try {
      expect(fixture.leftSnapshot.pid).not.toBe(fixture.rightSnapshot.pid);
      await fixture.left.seed({ nodeId, content: baseBody, title: 'Continuous article' });
      await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
      const baseId = (await read(fixture.rightSnapshot.databasePath)).current.version_id!;
      await expect(fixture.right.invoke('content_editing_session', { nodeId, sessionId: 'editing', action: 'begin' }))
        .resolves.toEqual({ changed: true });
      await save(fixture.right, baseId, baseBody, 'local-1', localBody(1), 1);
      await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
      for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) {
        const state = await read(path);
        expect(state.current.version_id).toBe('local-1');
        expect(state.bodies).toEqual(new Set([localBody(1)]));
        expect(state.parents).toEqual([{ version_id: 'local-1', parent_version_id: baseId, ordinal: 0 }]);
        expect(state.holds).toEqual([]);
      }
      await exerciseForkAndExit(fixture, baseId);
      succeeded = true;
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      if (succeeded) await fs.rm(fixture.root, { recursive: true, force: true });
      else console.info('Continuous editing HTTP fixture:', fixture.root);
    }
  });

type Fixture = Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>>;

async function exerciseForkAndExit(fixture: Fixture, baseId: string) {
  await save(fixture.left, baseId, baseBody, 'remote', remoteBody, 2);
  await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
  const returned = (await read(fixture.leftSnapshot.databasePath)).current;
  expect(returned.ancestor_version_ids).toContain('local-1');
  expect(returned.ancestor_version_ids).toContain('remote');
  const received = await read(fixture.rightSnapshot.databasePath);
  expect(received.current.version_id).toBe('local-1');
  expect(received.parents.some(row => row.version_id === returned.version_id)).toBe(true);
  await save(fixture.right, 'local-1', localBody(1), 'local-2', localBody(2), 3);
  await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
  const secondReturn = (await read(fixture.leftSnapshot.databasePath)).current;
  expect(secondReturn.ancestor_version_ids).toContain('local-2');
  const secondReceived = await read(fixture.rightSnapshot.databasePath);
  expect(secondReceived.current.version_id).toBe('local-2');
  expect(secondReceived.parents.some(row => row.version_id === secondReturn.version_id)).toBe(true);
  await fixture.right.invoke('collect_content');
  await save(fixture.right, 'local-2', localBody(2), 'local-3', localBody(3), 4);
  const active = await read(fixture.rightSnapshot.databasePath);
  expect(active.current).toMatchObject({ version_id: 'local-3', body_text: localBody(3), parent_version_ids: ['local-2'] });
  expect(active.holds).toEqual([]);
  await expect(fixture.right.invoke('content_editing_session', { nodeId, sessionId: 'editing', action: 'end' }))
    .resolves.toEqual({ changed: true });
  await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
  await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
  const right = await read(fixture.rightSnapshot.databasePath);
  const left = await read(fixture.leftSnapshot.databasePath);
  expect(left.current.version_id).toBe(right.current.version_id);
  expect(right.current.ancestor_version_ids).toEqual(expect.arrayContaining(['local-3', 'remote']));
  expect(right.bodies).toEqual(new Set([localBody(3), remoteBody]));
  expect(left.bodies).toEqual(right.bodies);
  expect(left.parents).toEqual(right.parents);
  expect(compareFramedSyncDatabaseInventories({ local: await readFixtureInventory(fixture.left),
    remote: await readFixtureInventory(fixture.right) })).toEqual([]);
  const restarted = await fixture.restartRight();
  expect(await read(restarted.snapshot.databasePath)).toEqual(right);
}
