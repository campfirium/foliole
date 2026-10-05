// @vitest-environment node
import { promises as fs } from 'node:fs';

import { afterEach, expect, it } from 'vitest';

import {
  coordinateDesktopFramedSyncProcessRound,
  readDesktopFramedSyncRoundControlLog
} from './desktopFramedSyncRoundProcessClient.js';
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
    await fs.writeFile(`${root}/version-chain-processes.log`, diagnostics);
    console.info('Failed framed-sync version-chain fixture:', root);
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

it('atomically applies a missing root-to-base-to-child chain before committing its receipt',
async () => {
  const fixture = await setup();
  const nodeId = 't326-three-generation-chain';
  for (const [title, content] of [
    ['Root', 'Root body'],
    ['Base', 'Base body'],
    ['Child', 'Child body']
  ]) {
    await fixture.left.seed({ content, nodeId, title });
  }
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath)).toMatchObject({
    parents: [expect.any(Object), expect.any(Object)],
    versions: [expect.any(Object), expect.any(Object), expect.any(Object)]
  });
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath)).toMatchObject({
    nodes: [], parents: [], versions: []
  });

  const receipt = await coordinateDesktopFramedSyncProcessRound({
    left: fixture.leftSnapshot,
    leftProcess: fixture.left,
    right: fixture.rightSnapshot,
    rightProcess: fixture.right
  });

  expect(receipt.result).toBe('converged');
  const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(received.nodes).toEqual([
    expect.objectContaining({ content: '', id: nodeId, title: 'Child' })
  ]);
  expect(received.versions).toHaveLength(3);
  expect(received.parents).toHaveLength(2);
  const byVersion = new Map(received.versions.map((version) => [
    (version as { version_id: string }).version_id,
    version
  ]));
  for (const edge of received.parents as { parent_version_id: string; version_id: string }[]) {
    expect(byVersion.has(edge.parent_version_id)).toBe(true);
    expect(byVersion.has(edge.version_id)).toBe(true);
  }
  expect(received.framedSync).toMatchObject({
    inboundStates: [{ state: 'applied' }], receipts: 1
  });
});

it('does not report convergence for divergent roots without a common base', async () => {
  const fixture = await setup();
  const nodeId = 't326-missing-common-base';
  await Promise.all([
    fixture.left.seed({ content: 'Left branch body', nodeId, title: 'Left branch' }),
    fixture.right.seed({ content: 'Right branch body', nodeId, title: 'Right branch' })
  ]);
  const beforeLeft = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
  const beforeRight = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(beforeLeft.parents).toEqual([]);
  expect(beforeRight.parents).toEqual([]);
  expect((beforeLeft.nodes[0] as { current_version_id: string }).current_version_id)
    .not.toBe((beforeRight.nodes[0] as { current_version_id: string }).current_version_id);

  const receipt = await coordinateDesktopFramedSyncProcessRound({
    left: fixture.leftSnapshot,
    leftProcess: fixture.left,
    right: fixture.rightSnapshot,
    rightProcess: fixture.right
  });

  expect(receipt.result).toBe('drained');
  expect(receipt.deferredObjects).toEqual([{ globalId: nodeId, objectType: 'node' }]);
  expect(await readDesktopFramedSyncRoundControlLog(fixture.left)).toContain('round_receipt');
  expect(await readDesktopFramedSyncRoundControlLog(fixture.right)).toContain('round_receipt');
});
