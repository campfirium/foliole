// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { groupRound, nodeTraces, withDb, withFixture } from './syncHistoryHorizon.testSupport.js';

const LOST = 'lost-in-crash';

const knownRevision = (databasePath: string, peerId: string) => withDb(databasePath, db => db.prepare(
  'SELECT proof_revision FROM node_version_device_revisions WHERE device_identity_key = ?').pluck().get(peerId) as number);
const acknowledged = (databasePath: string, sourceId: string) => withDb(databasePath, db => db.prepare(
  'SELECT proof_revision FROM node_version_local_source_revisions WHERE source_device_identity_key = ?')
  .pluck().get(sourceId) as number | undefined);
const content = (databasePath: string, nodeId: string) => withDb(databasePath, db =>
  db.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId));

it('keeps syncing after a peer loses its last acknowledged commits in a crash', { meta: { calibratedMs: 60_000 } }, async () => withFixture(async (fixture) => {
  const left = fixture.leftSnapshot;
  await fixture.left.seed({ content: 'Before the crash', nodeId: 'kept', title: 'Kept' });
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  const durable = path.join(fixture.root, 'right-durable.db');
  withDb(fixture.rightSnapshot.databasePath, db => db.exec(`VACUUM INTO '${durable}'`));
  const durableAck = withDb(durable, db => db.prepare(`SELECT proof_revision FROM node_version_local_source_revisions
    WHERE source_device_identity_key = ?`).pluck().get(left.deviceId) as number | undefined) ?? 0;

  await fixture.left.seed({ content: 'Written just before the power cut', nodeId: LOST, title: 'Lost' });
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  expect(knownRevision(left.databasePath, fixture.rightSnapshot.deviceId)).toBeGreaterThan(durableAck);

  // The power cut: the peer reopens from what reached its disk, same library, fewer acknowledged commits.
  await fixture.right.close();
  for (const suffix of ['', '-wal', '-shm']) await fs.rm(`${fixture.rightSnapshot.databasePath}${suffix}`, { force: true });
  await fs.copyFile(durable, fixture.rightSnapshot.databasePath);
  const { process: right, snapshot: reopened } = await fixture.restartRight();
  expect(nodeTraces(reopened.databasePath, LOST).node).toBe(0);

  expect(await groupRound(fixture.left, reopened)).toMatchObject({ complete: true });
  expect(content(reopened.databasePath, LOST)).toBe('Written just before the power cut');
  expect(content(reopened.databasePath, 'kept')).toBe('Before the crash');
  expect(await groupRound(right, left)).toMatchObject({ complete: true });
  expect(acknowledged(reopened.databasePath, left.deviceId)).toBeGreaterThan(durableAck);
}));
