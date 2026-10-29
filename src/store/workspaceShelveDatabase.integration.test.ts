// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { parseNodeSnapshotArgs } from '../../electron/ipc/commandParserNodeSnapshot';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState';
import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { saveDailyFlowSourceSettings, type DailyFlowSourceSettingsArgs } from '../../lib/core/flow/dailyFlowSourceSettings';
import type { Node } from '../features/nodes/model/nodeTypes';
import { node, now, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { createShelveNodeAction, createUnshelveNodeAction } from './workspaceStoreNodeShelveAction';
import { createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';

let peer: Peer;
let loseReceipt = false;
let beforeSave: (() => Promise<void>) | undefined;
let attempts = 0;
let failedSaves = 0;
let reads = 0;
let readGate: Promise<void> | undefined;
let receiptGate: Promise<void> | undefined;
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: unknown) => {
  if (command === 'load_node_learning') {
    const result = readWorkspaceNodeLearning(peer.driver, (args as { nodeIds: string[] }).nodeIds);
    reads++;
    await readGate;
    return result;
  }
  if (command === 'save_daily_flow_source_settings') {
    attempts++;
    await beforeSave?.();
    beforeSave = undefined;
    try {
      const result = await saveDailyFlowSourceSettings(peer.port, args as DailyFlowSourceSettingsArgs, persistence, peer.name, settings(peer).scope!);
      if (loseReceipt) { loseReceipt = false; throw new Error('receipt_lost'); }
      await receiptGate;
      return result;
    } catch (error) { failedSaves++; throw error; }
  }
  if (command === 'update_node_content') {
    upsertNodeSnapshot(peer.driver, { ...parseNodeSnapshotArgs(args as Record<string, unknown>), hostName: peer.name });
    return null;
  }
  if (command === 'save_node_reading_state') {
    saveNodeReadingStateWithSync(peer.driver, { ...(args as Parameters<typeof saveNodeReadingStateWithSync>[1]), hostName: peer.name });
    return null;
  }
  throw new Error(`Unexpected shelve command: ${command}`);
} }));
beforeEach(async () => {
  [peer] = await setupPeers();
  loseReceipt = false;
  beforeSave = undefined;
  attempts = 0;
  failedSaves = 0;
  reads = 0;
  readGate = undefined;
  receiptGate = undefined;
});
afterEach(closeLibraries);

async function prepare() {
  node(peer, 'folder', 'folder'); node(peer, 'a', 'topic', 'folder'); node(peer, 'b', 'topic', 'folder');
  peer.db.prepare("UPDATE nodes SET manual_child_order=?, sequential_reading_enabled=1 WHERE id='folder'").run(JSON.stringify(['a', 'b']));
  const reading = { intervalDurationMs: 777000, intervalGrowthFactor: 1.7, lastHandledAt: now, nextAt: now,
    priority: 3, readingPosition: 0, repetitionCount: 9, state: 'active' as const };
  for (const id of ['a', 'b']) await persistence.reading(peer.port, { nodeId: id, before: null,
    after: { ...reading, state: id === 'a' ? 'active' : 'locked' } }, now);
  const { session } = await openDailyFlow(peer.port, { now, mode: 'reading-only' }, settings(peer), persistence);
  const facts = await snapshot(peer);
  const nodes = Object.values(facts.nodesById).map(value => {
    const { reading: ignored, ...display } = value;
    void ignored;
    return Object.assign(display, { content: `Body ${value.id}`, hasContent: true, hasReveal: false, bodyStatus: 'ready', learningSummary: { reading: value.reading
      ? { state: value.reading.state, repetitionCount: value.reading.repetitionCount } : null, review: null } });
  }) as Node[];
  const app = createSetStateHarness({ ...createWorkspaceFixture(nodes), libraryScope: settings(peer).scope!,
    activeNodeId: 'a', reviewSession: session, reviewSessionMode: 'reading-only' });
  const history = createWorkspaceActionHistoryActions(app.setState, app.getState);
  app.setState(history);
  return { ...app, history, shelve: createShelveNodeAction(app.setState, app.getState),
    unshelve: createUnshelveNodeAction(app.setState, app.getState), reading };
}

it('shelves a lightweight topic without rewriting its body or resetting the released topic learning', async () => {
  const app = await prepare();
  expect(app.shelve('a', now)).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.pendingAction).toBeNull());
  const saved = await snapshot(peer);
  expect(saved.nodesById.a?.shelvedAt).toBe(now);
  expect(saved.nodesById.a?.reading).toEqual(app.reading);
  expect(saved.nodesById.b?.reading).toEqual(app.reading);
  expect(app.history.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect((await snapshot(peer)).nodesById.b?.reading).toEqual({ ...app.reading, state: 'locked' });
  expect((await snapshot(peer)).nodesById.a?.shelvedAt).toBeFalsy();
  expect(app.history.redoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect((await snapshot(peer)).nodesById.b?.reading).toEqual(app.reading);
});

it('retains the original in-flight shelve timestamp and facts after losing a committed receipt', async () => {
  const app = await prepare();
  loseReceipt = true;
  expect(app.shelve('a', now)).toBe(true);
  await vi.waitFor(() => expect(failedSaves).toBe(1));
  const pendingId = app.getState().appActionHistory.pendingAction!.entry.id;
  expect((await snapshot(peer)).nodesById.a?.shelvedAt).toBe(now);
  expect(app.shelve('a', '2026-10-27T00:00:00.000Z')).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.pendingAction).toBeNull());
  expect(app.getState().appActionHistory.undoStack.at(-1)?.id).toBe(pendingId);
  expect(app.getState().nodesById.a?.shelvedAt).toBe(now);
  expect((await snapshot(peer)).nodesById.b?.reading).toEqual(app.reading);
});

it('rolls back a partial transaction and retries the same pending shelve after storage recovers', async () => {
  const app = await prepare();
  peer.db.exec("CREATE TRIGGER reject_shelve BEFORE INSERT ON node_reading WHEN NEW.node_id='b' BEGIN SELECT RAISE(ABORT,'storage_unavailable'); END");
  expect(app.shelve('a', now)).toBe(true);
  await vi.waitFor(() => expect(failedSaves).toBe(1));
  expect((await snapshot(peer)).nodesById.a?.shelvedAt).toBeFalsy();
  expect((await snapshot(peer)).nodesById.b?.reading).toEqual({ ...app.reading, state: 'locked' });
  peer.db.exec('DROP TRIGGER reject_shelve');
  expect(app.shelve('a', '2026-10-27T00:00:00.000Z')).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.pendingAction).toBeNull());
  expect((await snapshot(peer)).nodesById.a?.shelvedAt).toBe(now);
});

it('preserves content committed after operation preparation', async () => {
  const app = await prepare();
  beforeSave = async () => upsertNodeSnapshot(peer.driver, { nodeId: 'a', parentNodeId: 'folder', kind: 'topic',
    title: 'New title', content: 'Concurrent body', reveal: null, anchorLink: null, isTitleManual: true,
    createdAt: now, updatedAt: now, hostName: peer.name, position: 0 });
  app.shelve('a', now);
  await vi.waitFor(() => expect(app.getState().appActionHistory.pendingAction).toBeNull());
  expect(peer.db.prepare("SELECT title, content FROM nodes WHERE id='a'").get()).toEqual({ title: 'New title', content: 'Concurrent body' });
  expect((await snapshot(peer)).nodesById.a?.reading).toEqual(app.reading);
});

it('rejects changed reading facts atomically and permits a fresh attempt without overwriting them', async () => {
  const app = await prepare();
  const changed = { ...app.reading, intervalDurationMs: 999000, state: 'locked' as const };
  beforeSave = async () => persistence.reading(peer.port, { nodeId: 'b', before: null, after: changed }, now);
  app.shelve('a', now);
  await vi.waitFor(() => expect(app.getState().appActionHistory.pendingAction).toBeNull());
  expect((await snapshot(peer)).nodesById.a?.shelvedAt).toBeFalsy();
  expect((await snapshot(peer)).nodesById.b?.reading).toEqual(changed);
  app.shelve('a', now);
  await vi.waitFor(() => expect(app.getState().appActionHistory.pendingAction).toBeNull());
  expect((await snapshot(peer)).nodesById.b?.reading).toEqual({ ...changed, state: 'active' });
});

it('discards a shelve prepared for a previous library', async () => {
  const app = await prepare();
  let release = () => {};
  readGate = new Promise(resolve => { release = resolve; });
  app.shelve('a', now);
  await vi.waitFor(() => expect(reads).toBe(1));
  app.setState({ libraryScope: 'other-library' });
  release();
  await vi.waitFor(() => expect(app.getState().appActionHistory.pendingAction).toBeNull());
  expect(attempts).toBe(0);
  expect((await snapshot(peer)).nodesById.a?.shelvedAt).toBeFalsy();
});

it('honors Undo requested while the shelve receipt is pending', async () => {
  const app = await prepare();
  let release = () => {};
  receiptGate = new Promise(resolve => { release = resolve; });
  app.shelve('a', now);
  await vi.waitFor(() => expect(attempts).toBe(1));
  expect(app.history.undoWorkspaceAction()).toBe(true);
  release();
  await vi.waitFor(() => {
    expect(app.getState().appActionHistory.pendingAction).toBeNull();
    expect(app.getState().appActionHistory.applying).toBeNull();
  });
  expect((await snapshot(peer)).nodesById.a?.shelvedAt).toBeFalsy();
  expect((await snapshot(peer)).nodesById.b?.reading).toEqual({ ...app.reading, state: 'locked' });
});

it('restores exactly the generated reading when shelve history creates and removes a previously unlearned slot', async () => {
  const app = await prepare();
  await persistence.reading(peer.port, { nodeId: 'b', before: { ...app.reading, state: 'locked' }, after: null }, now);
  app.shelve('a', now);
  await vi.waitFor(() => expect(app.getState().appActionHistory.pendingAction).toBeNull());
  const created = (await snapshot(peer)).nodesById.b?.reading;
  expect(created).toMatchObject({ state: 'active', repetitionCount: 0, intervalDurationMs: 0 });
  expect(app.history.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect((await snapshot(peer)).nodesById.b?.reading).toBeNull();
  expect(app.history.redoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect((await snapshot(peer)).nodesById.b?.reading).toEqual(created);
});
