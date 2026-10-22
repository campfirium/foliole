// @vitest-environment node
import { expect, it } from 'vitest';

import { DELETED, deletePermanently, EDITED, groupRound, nodeTraces, passTime, seedHistory, versionIds, withDb,
  withFixture } from './syncHistoryHorizon.testSupport.js';

const currentBody = (databasePath: string) => withDb(databasePath, db => db.prepare(`SELECT version.body_text
  FROM nodes node JOIN node_sync_versions version ON version.version_id = node.current_version_id
  WHERE node.id = ?`).pluck().get(EDITED));

it('leaves a member silent for over 90 days out of the group line and overwrites it from the group once confirmed', { meta: { calibratedMs: 150_000 } }, async () => withFixture(async (fixture, trackThird) => {
  const started = await fixture.startThird();
  trackThird(started.process);
  const third = started.snapshot;
  await seedHistory(fixture);
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  expect(await groupRound(started.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(nodeTraces(third.databasePath, DELETED).node).toBe(1);
  await started.process.seed({ content: 'Offline edit that never synced', nodeId: 'offline-only', title: 'Offline' });
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath, third.databasePath]) passTime(path, 100, third.deviceId);
  deletePermanently(fixture.leftSnapshot.databasePath, DELETED, new Date().toISOString());
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  expect(nodeTraces(fixture.rightSnapshot.databasePath, DELETED)).toMatchObject({ node: 0, tombstone: 1 });
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath, third.databasePath]) passTime(path, 2);

  // The silent member no longer holds the line back: the others reclaim what they both passed.
  expect(await groupRound(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) {
    expect(versionIds(path, EDITED)).toHaveLength(1);
    expect(nodeTraces(path, DELETED)).toMatchObject({ node: 0, tombstone: 0 });
  }

  // Neither side lets it back in through an ordinary round, so its old copy cannot revive the deletion.
  expect(await groupRound(started.process, fixture.leftSnapshot)).toMatchObject({ complete: false });
  expect(await groupRound(fixture.left, third)).toMatchObject({ complete: false });
  for (const path of [fixture.leftSnapshot.databasePath, fixture.rightSnapshot.databasePath]) {
    expect(nodeTraces(path, DELETED).node).toBe(0);
    expect(nodeTraces(path, 'offline-only').node).toBe(0);
  }

  await started.process.invoke('round', { input: { kind: 'remember_peer', peerOrigin: fixture.leftSnapshot.origin,
    peer: { deviceId: fixture.leftSnapshot.deviceId, libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch` } } });
  await started.process.invoke('expired_overwrite');
  // A second confirmation while the overwrite is under way must not restart it with a new library.
  await expect(started.process.invoke('expired_overwrite')).rejects.toThrow('sync_group_local_adoption_pending');
  expect(await groupRound(started.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(nodeTraces(third.databasePath, DELETED).node).toBe(0);
  expect(nodeTraces(third.databasePath, 'offline-only').node).toBe(0);
  expect(currentBody(third.databasePath)).toBe('Final text');

  // Overwritten, it is a current member again and ordinary rounds resume both ways.
  expect(await groupRound(started.process, fixture.leftSnapshot)).toMatchObject({ complete: true });
  expect(await groupRound(fixture.left, third)).toMatchObject({ complete: true });
  expect(nodeTraces(fixture.leftSnapshot.databasePath, DELETED).node).toBe(0);
}));
