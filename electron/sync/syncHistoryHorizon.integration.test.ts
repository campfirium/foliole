// @vitest-environment node
import { expect, it } from 'vitest';

import { DELETED, deletePermanently, EDITED, groupRound, nodeTraces, passTime, retireThirdMember, seedHistory,
  versionIds, withDb, withFixture } from './syncHistoryHorizon.testSupport.js';

it('reclaims old history and deletions once every member has passed them', { meta: { calibratedMs: 90_000 } }, async () => withFixture(async (fixture, trackThird) => {
  const started = await fixture.startThird();
  trackThird(started.process);
  const third = started.snapshot;
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) retireThirdMember(path, third.deviceId);
  await seedHistory(fixture);
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) passTime(path);
  deletePermanently(fixture.leftSnapshot.databasePath, DELETED);
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });

  const head = withDb(fixture.leftSnapshot.databasePath, db => db.prepare(
    'SELECT current_version_id FROM nodes WHERE id = ?').pluck().get(EDITED));
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) {
    expect(versionIds(path, EDITED)).toEqual([head]);
    expect(withDb(path, db => db.prepare(`SELECT version.body_text FROM nodes node JOIN node_sync_versions version
      ON version.version_id = node.current_version_id WHERE node.id = ?`).pluck().get(EDITED))).toBe('Final text');
    expect(nodeTraces(path, DELETED)).toEqual({ node: 0, tombstone: 0, versions: 0, inventory: 0 });
  }
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  expect(versionIds(fixture.rightSnapshot.databasePath, EDITED)).toEqual([head]);
  expect(nodeTraces(fixture.rightSnapshot.databasePath, DELETED).versions).toBe(0);
}));

it('keeps history and deletions while a member has not caught up, then reclaims them without revival', { meta: { calibratedMs: 150_000 } }, async () => withFixture(async (fixture, trackThird) => {
  const started = await fixture.startThird();
  trackThird(started.process);
  const third = started.snapshot;
  await seedHistory(fixture);
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  expect(await groupRound(started.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(nodeTraces(third.databasePath, DELETED).node).toBe(1);
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath, third.databasePath]) passTime(path);
  deletePermanently(fixture.leftSnapshot.databasePath, DELETED);
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });

  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) {
    expect(versionIds(path, EDITED)).toHaveLength(3);
    expect(nodeTraces(path, DELETED)).toMatchObject({ node: 0, tombstone: 1 });
  }

  expect(await groupRound(started.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(nodeTraces(third.databasePath, DELETED)).toMatchObject({ node: 0, tombstone: 1 });
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  expect(await groupRound(started.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });

  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath, third.databasePath]) {
    expect(versionIds(path, EDITED), path).toHaveLength(1);
    expect(nodeTraces(path, DELETED), path).toEqual({ node: 0, tombstone: 0, versions: 0, inventory: 0 });
  }
  expect(await groupRound(started.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(nodeTraces(third.databasePath, DELETED).node).toBe(0);
}));

it('agrees on independent permanent deletions and still protects a third device returning with an old node', async () => withFixture(async (fixture, trackThird) => {
  const { process: third, snapshot } = await fixture.startThird();
  trackThird(third);
  const left = fixture.leftSnapshot;
  const right = fixture.rightSnapshot;
  await seedHistory(fixture);
  expect(await groupRound(fixture.left, right)).toMatchObject({ complete: true });
  expect(await groupRound(third, left)).toMatchObject({ complete: true });
  await fixture.right.seed({ nodeId: DELETED, content: 'An offline edit', title: 'Deleted' });
  const time = new Date().toISOString();
  for (const peer of [left, right]) deletePermanently(peer.databasePath, DELETED, time);
  const deletion = (path: string) => withDb(path, db => db.prepare(
    'SELECT version_id FROM node_sync_tombstones WHERE node_id = ?').pluck().get(DELETED));
  const original = [deletion(left.databasePath), deletion(right.databasePath)];
  expect(original[0]).toBeDefined();
  expect(original[0]).not.toEqual(original[1]);
  expect(await groupRound(fixture.left, right)).toMatchObject({ complete: true });
  expect(await groupRound(fixture.right, left)).toMatchObject({ complete: true });
  expect([deletion(left.databasePath), deletion(right.databasePath)]).toEqual(original);
  expect(nodeTraces(snapshot.databasePath, DELETED).node).toBe(1);
  expect(await groupRound(third, right)).toMatchObject({ complete: true });
  const traces = nodeTraces(snapshot.databasePath, DELETED);
  expect(traces).toMatchObject({ node: 0, tombstone: 1 });
  expect(await groupRound(third, left)).toMatchObject({ complete: true });
  expect(nodeTraces(snapshot.databasePath, DELETED)).toEqual(traces);
}));
