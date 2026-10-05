// @vitest-environment node
import { promises as fs } from 'node:fs';

import { afterEach, expect, it } from 'vitest';

import {
  createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess,
  readDesktopFramedSyncLibraryEvidence
} from './desktopFramedSyncTwoProcess.testSupport.js';

let root = '';
const processes: DesktopFramedSyncFixtureProcess[] = [];

afterEach(async ({ task }) => {
  const active = processes.splice(0);
  await Promise.allSettled(active.map((process) => process.close()));
  if (!root) return;
  if (task.result?.state === 'fail') {
    await fs.writeFile(`${root}/processes.log`, active.map((process, index) =>
      `Process ${index + 1}\n${process.diagnostics()}`).join('\n'));
    console.info('Failed framed-sync relation/review fixture:', root);
  } else {
    await fs.rm(root, { force: true, recursive: true });
  }
  root = '';
});

async function setup() {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  return fixture;
}

it('applies a node, parent relation, review, and receipt through one production transfer', async () => {
  const fixture = await setup();
  await Promise.all([
    fixture.left.seedRelationReview('sender'),
    fixture.right.seedRelationReview('receiver')
  ]);
  await fixture.left.synchronize(fixture.rightSnapshot.origin, 't326-relation-review');

  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([expect.objectContaining({
    current_version_id: 't326-child-version', id: 't326-relation-review'
  })]);
  expect(received.parents).toEqual([{
    ordinal: 0, parent_version_id: 't326-base-version', version_id: 't326-child-version'
  }]);
  expect(received.reviews).toEqual([{
    grade: 3, node_id: 't326-relation-review', op_id: 't326-review-op'
  }]);
  expect(received.framedSync).toMatchObject({
    inboundFacts: 3, inboundFrames: 6, inboundStates: [{ state: 'applied' }], receipts: 1
  });
});

it('rolls back node and relation apply and writes no receipt when a review conflicts', async () => {
  const fixture = await setup();
  await Promise.all([
    fixture.left.seedRelationReview('sender'),
    fixture.right.seedRelationReview('receiver_conflict')
  ]);
  await expect(fixture.left.synchronize(
    fixture.rightSnapshot.origin, 't326-relation-review'
  )).rejects.toThrow();

  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([expect.objectContaining({
    current_version_id: 't326-base-version', id: 't326-relation-review'
  })]);
  expect(received.versions).toEqual([
    expect.objectContaining({ version_id: 't326-base-version' })
  ]);
  expect(received.parents).toEqual([]);
  expect(received.reviews).toEqual([{
    grade: 4, node_id: 't326-relation-review', op_id: 't326-review-op'
  }]);
  expect(received.framedSync.receipts).toBe(0);
});
