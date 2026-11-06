// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { buildDesktopFramedSyncFixture, createDesktopFramedSyncTwoProcessFixture, type DesktopFramedSyncFixtureProcess } from './desktopFramedSyncTwoProcess.testSupport.js';

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

it.each(['left', 'right'] as const)('automatically sends successive ordinary saves without ending editing on %s',
  { meta: { calibratedMs: 60_000 } }, async side => {
    const artifacts = path.resolve('.tmp/artifacts/T727');
    await fs.mkdir(artifacts, { recursive: true });
    const buildRoot = await fs.mkdtemp(path.join(artifacts, 'continuous-auto-send-'));
    const script = path.join(buildRoot, 'fixture.mjs');
    await buildDesktopFramedSyncFixture(script, true);
    const fixture = await createDesktopFramedSyncTwoProcessFixture(script, true, true);
    let succeeded = false;
    try {
      await fixture.left.seed({ nodeId, content: baseBody, title: 'Concurrent article' });
      await fixture.right.invoke('activation_start');
      await fixture.left.invoke('activation_start');
      await fixture.right.invoke('activation_found', { origin: fixture.leftSnapshot.origin });
      await fixture.left.invoke('activation_found', { origin: fixture.rightSnapshot.origin });
      const baseId = (await read(fixture[`${side}Snapshot`].databasePath)).current.version_id!;
      await fixture[side].invoke('content_editing_session', { nodeId, sessionId: 'editing', action: 'begin' });
      await assertAutomaticSaves(fixture, baseId, side);
      const state = await read(fixture.rightSnapshot.databasePath);
      const restarted = await fixture.restartRight();
      expect(await read(restarted.snapshot.databasePath)).toEqual(state);
      succeeded = true;
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      if (succeeded) {
        await fs.rm(fixture.root, { recursive: true, force: true });
        await fs.rm(buildRoot, { recursive: true, force: true });
      } else console.info('Automatic editing fixture:', fixture.root, buildRoot);
    }
  });

async function assertAutomaticSaves(fixture: Fixture, baseId: string, side: 'left' | 'right') {
  const receiver = side === 'left' ? fixture.rightSnapshot : fixture.leftSnapshot;
  let parentId = baseId;
  let parentBody = baseBody;
  for (const step of [1, 2, 3]) {
    const versionId = `auto-${step}`;
    const content = localBody(step);
    await fixture[side].invoke('editor_content_edit', {
      parent: { nodeId, kind: 'topic', parentNodeId: null, title: 'Concurrent article', content,
        isTitleManual: true, reveal: null, anchorLink: null, position: 0,
        createdAt: '2026-10-05T00:00:00.000Z', updatedAt: `2026-11-06T01:00:0${step}.000Z` },
      affectedAnchors: [], edit: { baseVersionId: parentId, baseContent: parentBody, versionId }
    });
    // Observe persistence only: no mutation notification, sync request or exit is injected here.
    await expect.poll(async () => (await read(receiver.databasePath)).current.version_id,
      { timeout: 5_000, interval: 40 }).toBe(versionId);
    for (const database of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) {
      const state = await read(database);
      expect(state.current).toMatchObject({ version_id: versionId, body_text: content, parent_version_ids: [parentId] });
      expect(state.bodies).toEqual(new Set([content]));
      expect(state.holds).toEqual([]);
    }
    parentId = versionId;
    parentBody = content;
  }
  // A valid end token after all three deliveries proves saves did not end the live session.
  await expect(fixture[side].invoke('content_editing_session', { nodeId, sessionId: 'editing', action: 'end' }))
    .resolves.toEqual({ changed: true });
}
