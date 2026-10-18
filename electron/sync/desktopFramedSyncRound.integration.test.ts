// @vitest-environment node
import { promises as fs } from 'node:fs';

import { afterEach, expect, it } from 'vitest';

import { readFixtureInventory }
  from './desktopFramedSyncPublicationRecovery.testSupport.js';
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
    const diagnostics = active.map((process, index) =>
      `Process ${index + 1}\n${process.diagnostics()}`).join('\n');
    await fs.writeFile(`${root}/round-processes.log`, diagnostics);
    console.info('Failed framed-sync round fixture:', root);
  } else {
    await fs.rm(root, { force: true, recursive: true });
  }
  root = '';
});

async function setup() {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  root = fixture.root;
  processes.push(fixture.left, fixture.right);
  return fixture;
}

it('converges a child sorted before its missing parent through the production round', async () => {
  const fixture = await setup();
  await fixture.left.seed({
    content: 'Parent body', nodeId: 't326-z-parent', title: 'Parent'
  });
  await fixture.left.seed({
    content: 'Child body', nodeId: 't326-a-child',
    parentNodeId: 't326-z-parent', title: 'Child'
  });

  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes).toEqual([]);
  await expect(fixture.left.synchronize(fixture.rightSnapshot.origin)).resolves.toMatchObject({ complete: true });
  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([
    expect.objectContaining({ content: 'Child body', id: 't326-a-child', parent_id: 't326-z-parent' }),
    expect.objectContaining({ content: 'Parent body', id: 't326-z-parent', parent_id: null })
  ]);
  expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
  const restarted = await fixture.restartRight();
  processes.push(restarted.process);
  const reopened = readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath);
  expect(reopened.nodes).toEqual(received.nodes);
  expect(reopened.versions).toEqual(received.versions);
  expect(reopened.parents).toEqual(received.parents);
});
