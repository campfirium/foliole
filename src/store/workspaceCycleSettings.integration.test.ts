// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { saveDailyFlowSourceSettings, type DailyFlowSourceSettingsArgs } from '../../lib/core/flow/dailyFlowSourceSettings';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import type { Node } from '../features/nodes/model/nodeTypes';
import { act, assertDurable, node, now, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

import { createSetFolderManualChildOrderAction } from './workspaceStoreManualChildOrderActions';
import { createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';
import { createSetNodeSequentialReadingAction } from './workspaceStoreSequentialReadingActions';

let peer: Peer;
let loseReceipt = false;
let beforeSave: (() => Promise<void>) | undefined;
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: unknown) => {
  if (command === 'save_daily_flow_source_settings') {
    await beforeSave?.();
    beforeSave = undefined;
    const result = await saveDailyFlowSourceSettings(peer.port, args as DailyFlowSourceSettingsArgs, persistence, peer.name, settings(peer).scope!);
    if (loseReceipt) { loseReceipt = false; throw new Error('receipt_lost'); }
    return result;
  }
  if (command === 'open_daily_flow') return openDailyFlow(peer.port, args as never, settings(peer), persistence);
  if (command === 'save_node_open_state') return null;
  throw new Error(`Unexpected settings command: ${command}`);
} }));
beforeEach(async () => { [peer] = await setupPeers(); loseReceipt = false; beforeSave = undefined; });
afterEach(closeLibraries);

async function setup() {
  node(peer, 'folder', 'folder'); node(peer, 'a', 'topic', 'folder'); node(peer, 'b', 'topic', 'folder');
  peer.db.prepare("UPDATE nodes SET manual_child_order=? WHERE id='folder'").run(JSON.stringify(['a', 'b']));
  let session = (await openDailyFlow(peer.port, { now, mode: 'reading-only', preferredNodeId: 'a' }, settings(peer), persistence)).session;
  session = await act(peer, session, 'soon');
  const facts = await snapshot(peer);
  const app = createSetStateHarness({ ...createWorkspaceFixture(Object.values(facts.nodesById) as Node[]),
    libraryScope: settings(peer).scope!, reviewSession: session, reviewSessionMode: 'reading-only' });
  return { ...app, sequential: createSetNodeSequentialReadingAction(app.setState, app.getState),
    order: createSetFolderManualChildOrderAction(app.setState, app.getState) };
}

it('saves source facts before choosing a new current, preserves Soon, and reopens durable settings', async () => {
  const app = await setup();
  const before = app.getState().reviewSession;
  const soon = (await readCycleRows(peer.port)).find(row => row.cohort === 'soon')!;
  expect(await app.sequential('folder', true, now)).toBe(true);
  expect(app.getState().reviewSession.currentNodeId).toBe('a');
  expect(app.getState().reviewSession.readTopicCount).toBe(before.readTopicCount);
  expect(app.getState().reviewSession.totalNodeCount).toBe(before.totalNodeCount);
  expect((await readCycleRows(peer.port, [soon.node_id]))[0]?.order_key).toBe(soon.order_key);
  expect((await readCycleRows(peer.port, [soon.node_id]))[0]?.cohort).toBe('soon');
  expect(await app.order('folder', ['b', 'a'], now)).toBe(true);
  expect(app.getState().reviewSession.currentNodeId).toBe('b');
  expect(app.getState().nodesById.a?.reading?.state).toBe('locked');
  expect(app.getState().nodesById.b?.reading?.state).toBe('active');
  await assertDurable(peer, app.getState().reviewSession);
  const saved = await snapshot(peer);
  expect(saved.nodesById.folder).toMatchObject({ manualChildOrder: ['b', 'a'], sequentialReadingEnabled: true });
  expect(saved.nodesById.a?.reading?.state).toBe('locked');
  const reopened = await openDailyFlow(peer.port, { now, mode: 'reading-only' }, settings(peer), persistence);
  expect(reopened.session).toEqual(app.getState().reviewSession);
});

it('rejects changed learning facts without replacing them or publishing a new renderer queue', async () => {
  const app = await setup();
  const before = app.getState();
  beforeSave = async () => {
    await persistence.reading(peer.port, { nodeId: 'a', before: null,
      after: { intervalDurationMs: 60000, intervalGrowthFactor: 1, lastHandledAt: now, nextAt: now,
        priority: 5, readingPosition: 0, repetitionCount: 3, state: 'dismissed' } }, now);
  };
  expect(await app.sequential('folder', true, now)).toBe(false);
  expect(app.getState()).toBe(before);
  expect((await snapshot(peer)).nodesById.a?.reading?.state).toBe('dismissed');
  expect((await snapshot(peer)).nodesById.folder?.sequentialReadingEnabled).not.toBe(true);
});

it('retries a saved setting after losing the receipt without advancing progress twice', async () => {
  const app = await setup();
  const before = app.getState();
  loseReceipt = true;
  expect(await app.sequential('folder', true, now)).toBe(false);
  expect(app.getState()).toBe(before);
  expect(await app.sequential('folder', true, now)).toBe(true);
  expect(app.getState().reviewSession.readTopicCount).toBe(before.reviewSession.readTopicCount);
  await assertDurable(peer, app.getState().reviewSession);
});

it('rolls back source preferences and all reading changes when persistence fails mid-transaction', async () => {
  const app = await setup();
  const before = await snapshot(peer);
  const cursor = await readDailyFlow(peer.port);
  let writes = 0;
  const args: DailyFlowSourceSettingsArgs = { scope: settings(peer).scope!, sourceNodeId: 'folder', now,
    before: { manualChildOrder: ['a', 'b'], sequentialReadingEnabled: null },
    after: { manualChildOrder: ['a', 'b'], sequentialReadingEnabled: true },
    readings: ['a', 'b'].map(nodeId => ({ nodeId, before: null, after: { intervalDurationMs: 0,
      intervalGrowthFactor: 1, lastHandledAt: now, nextAt: now, priority: 5,
      readingPosition: 0, repetitionCount: 0, state: nodeId === 'a' ? 'active' : 'locked' } })) };
  await expect(saveDailyFlowSourceSettings(peer.port, args, { ...persistence, reading: async (...values) => {
    await persistence.reading(...values);
    if (++writes === 2) throw new Error('save_failed');
  } }, peer.name, settings(peer).scope!)).rejects.toThrow('save_failed');
  expect(await snapshot(peer)).toEqual(before);
  expect(await readDailyFlow(peer.port)).toEqual(cursor);
  expect(app.getState().reviewSession).toEqual(cursor!.session);
});

it('rejects a different library scope before changing any source or learning state', async () => {
  await setup();
  const before = await snapshot(peer);
  await expect(saveDailyFlowSourceSettings(peer.port, { scope: 'other-library', sourceNodeId: 'folder', now,
    before: { manualChildOrder: ['a', 'b'], sequentialReadingEnabled: null },
    after: { manualChildOrder: ['b', 'a'], sequentialReadingEnabled: true }, readings: [] },
  persistence, peer.name, settings(peer).scope!)).rejects.toThrow('daily_flow_library_changed');
  expect(await snapshot(peer)).toEqual(before);
});
