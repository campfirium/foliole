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
    await fs.writeFile(`${root}/round-processes.log`, diagnostics);
    console.info('Failed framed-sync round fixture:', root);
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

it('commits each side missing object and both terminal round receipts in one production round',
async () => {
  const fixture = await setup();
  await Promise.all([
    fixture.left.seed({ content: 'Body from A', nodeId: 't326-round-a', title: 'Round A' }),
    fixture.right.seed({ content: 'Body from B', nodeId: 't326-round-b', title: 'Round B' })
  ]);

  const receipt = await coordinateDesktopFramedSyncProcessRound({
    left: fixture.leftSnapshot,
    leftProcess: fixture.left,
    right: fixture.rightSnapshot,
    rightProcess: fixture.right
  });

  expect(receipt.result).toBe('converged');
  expect(receipt.transfers.map((transfer) =>
    [transfer.direction, transfer.globalId, transfer.state])).toEqual([
    ['local_to_remote', 't326-round-a', 'committed'],
    ['remote_to_local', 't326-round-b', 'committed']
  ]);
  const left = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
  const right = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  const expectedNodes = [
    expect.objectContaining({ id: 't326-round-a' }),
    expect.objectContaining({ id: 't326-round-b' })
  ];
  expect(left.nodes).toEqual(expectedNodes);
  expect(right.nodes).toEqual(expectedNodes);
  expect(left.framedSync).toMatchObject({ outboundHolds: 0, receipts: 2 });
  expect(right.framedSync).toMatchObject({ outboundHolds: 0, receipts: 2 });
  expect(await readDesktopFramedSyncRoundControlLog(fixture.left)).toContain('round_receipt');
  expect(await readDesktopFramedSyncRoundControlLog(fixture.right)).toContain('round_receipt');
});

it('converges a child sorted before its missing parent through the production round', async () => {
  const fixture = await setup();
  await fixture.left.seed({
    content: 'Parent body', nodeId: 't326-z-parent', title: 'Parent'
  });
  await fixture.left.seed({
    content: 'Child body', nodeId: 't326-a-child',
    parentNodeId: 't326-z-parent', title: 'Child'
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
    expect.objectContaining({ id: 't326-a-child', parent_id: 't326-z-parent' }),
    expect.objectContaining({ id: 't326-z-parent', parent_id: null })
  ]);
});

it('keeps a published transfer pending and emits no terminal round receipt', async () => {
  const fixture = await setup();
  await fixture.left.seed({ content: 'Pending body', nodeId: 't326-round-pending', title: 'Pending' });

  const receipt = await coordinateDesktopFramedSyncProcessRound({
    left: fixture.leftSnapshot,
    leftProcess: fixture.left,
    options: { pendingSide: 'left' },
    right: fixture.rightSnapshot,
    rightProcess: fixture.right
  });

  expect(receipt.result).toBe('pending');
  expect(receipt.transfers.map((transfer) => transfer.state)).toEqual(['pending']);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).framedSync)
    .toMatchObject({ outboundHolds: 1, outboundStates: [{ state: 'published' }] });
  expect(await readDesktopFramedSyncRoundControlLog(fixture.left)).not.toContain('round_receipt');
  expect(await readDesktopFramedSyncRoundControlLog(fixture.right)).not.toContain('round_receipt');
});

it('turns an empty deferred selection into drained terminal receipts without publishing', async () => {
  const fixture = await setup();
  await fixture.left.seed({ content: 'Deferred body', nodeId: 't326-round-deferred', title: 'Deferred' });

  const receipt = await coordinateDesktopFramedSyncProcessRound({
    left: fixture.leftSnapshot,
    leftProcess: fixture.left,
    options: { emptyDeferredSide: 'left' },
    right: fixture.rightSnapshot,
    rightProcess: fixture.right
  });

  expect(receipt).toMatchObject({
    deferredObjects: [{ globalId: 't326-round-deferred', objectType: 'node' }],
    result: 'drained',
    transfers: []
  });
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).framedSync)
    .toMatchObject({ outboundHolds: 0, outboundStates: [] });
  expect(await readDesktopFramedSyncRoundControlLog(fixture.left)).toContain('round_receipt');
  expect(await readDesktopFramedSyncRoundControlLog(fixture.right)).toContain('round_receipt');
});

it('replays the durable receipt after receiver restart when the round repeats a stale need', async () => {
  const fixture = await setup();
  await fixture.left.seed({ content: 'Replay body', nodeId: 't326-round-replay', title: 'Replay' });
  await coordinateDesktopFramedSyncProcessRound({
    left: fixture.leftSnapshot, leftProcess: fixture.left,
    right: fixture.rightSnapshot, rightProcess: fixture.right
  });
  const restarted = await fixture.restartRight();
  processes.push(restarted.process);

  const replay = await coordinateDesktopFramedSyncProcessRound({
    left: fixture.leftSnapshot,
    leftProcess: fixture.left,
    options: { inventoryOverride: { right: [] } },
    right: restarted.snapshot,
    rightProcess: restarted.process
  });

  expect(replay.result).toBe('converged');
  expect(replay.transfers.map((transfer) => transfer.state)).toEqual(['committed']);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).framedSync)
    .toMatchObject({ outboundFrames: 8, outboundHolds: 0, receipts: 1 });
  expect(readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath).framedSync)
    .toMatchObject({ inboundFrames: 4, outboundFrames: 1, receipts: 1 });
  expect(await readDesktopFramedSyncRoundControlLog(restarted.process)).toContain('round_receipt');
});

it('sends the frozen publication when the current node changes after selection', async () => {
  const fixture = await setup();
  await fixture.left.seed({
    content: 'Frozen body', nodeId: 't326-round-frozen', title: 'Frozen title'
  });
  let changed = false;

  const receipt = await coordinateDesktopFramedSyncProcessRound({
    left: fixture.leftSnapshot,
    leftProcess: fixture.left,
    options: {
      beforeSend: async (side) => {
        if (side !== 'left' || changed) return;
        changed = true;
        await fixture.left.seed({
          content: 'Edited after selection', nodeId: 't326-round-frozen', title: 'Edited title'
        });
      }
    },
    right: fixture.rightSnapshot,
    rightProcess: fixture.right
  });

  expect(receipt.result).toBe('converged');
  const right = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
  expect(right.nodes).toEqual([
    expect.objectContaining({ id: 't326-round-frozen', title: 'Frozen title' })
  ]);
  expect(right.versions).toEqual([
    expect.objectContaining({ body_text: 'Frozen body', object_id: 't326-round-frozen' })
  ]);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes)
    .toEqual([expect.objectContaining({ id: 't326-round-frozen', title: 'Edited title' })]);
});
