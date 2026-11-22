// @vitest-environment node
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { closeLibraries, root, type Peer } from '../../electron/database/syncLibrary.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../electron/sync/desktopFramedSyncFiles.js';
import { applyDailyFlowTable } from '../../lib/core/sync/dailyFlowTableApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { RequestSyncFiles, withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { act, exchange, node, open, setupPeers } from '../test/dailyFlowExceptions.testSupport.js';

afterEach(closeLibraries);

async function withSnapshot<T>(peer: Peer, id: string, task: (files: RequestSyncFiles) => Promise<T>) {
  const entry = (await readFramedSyncInventory(peer.port)).find(value => value.globalId === id && value.objectType === 'daily_flow')!;
  const difference = compareFramedSyncInventories({ local: [entry], remote: [] })[0]!;
  return withRequestSyncFiles(createDesktopFramedSyncFiles(path.join(root, crypto.randomUUID())), async files => {
    await peer.port.transaction(tx => writeRequestSyncSnapshot(tx, difference, files));
    return task(files);
  });
}

async function receiveGrade(unrelated: number) {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(a, id, 'item');
  for (let index = 0; index < unrelated; index += 1) node(a, `unrelated-${index}`, 'topic');
  await exchange(a, b);
  const session = await open(a);
  const graded = session.currentNodeId!;
  await act(a, session, 'grade', '2026-10-26T08:01:00.000Z');
  const id = a.db.prepare('SELECT head_id FROM daily_flow_sync_projection').pluck().get() as string;
  return withSnapshot(a, id, async files => ({ graded,
    first: await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name)),
    again: await b.port.transaction(tx => applyDailyFlowTable(tx, files.dailyFlow, id, b.name)) }));
}

// WA-059: an inbound Flow table used to ask every receiver for a whole-library rehydrate, even when it applied nothing.
it('names only the graded node and asks nothing once its facts are present, whatever the library size', async () => {
  const small = await receiveGrade(0);
  await closeLibraries();
  const large = await receiveGrade(60);
  for (const result of [small, large]) {
    expect(result.first.workspaceScope).toEqual({ kind: 'nodes', nodeIds: [], reviewNodeIds: [result.graded] });
    expect(result.again.workspaceScope).toEqual({ kind: 'nodes', nodeIds: [] });
  }
});
