// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { saveDailyFlowSourceSettings, type DailyFlowSourceSettingsArgs } from '../../lib/core/flow/dailyFlowSourceSettings';
import type { Node } from '../features/nodes/model/nodeTypes';
import { act, node, now, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

import { createSetFolderManualChildOrderAction } from './workspaceStoreManualChildOrderActions';
import { createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';
import { createSetNodeSequentialReadingAction } from './workspaceStoreSequentialReadingActions';

const showNotice = vi.hoisted(() => vi.fn());
vi.mock('../shared/ui/AppRuntimeNotice', () => ({ showAppRuntimeNotice: showNotice }));
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

it('keeps both of two rapid manual order changes to the same folder', async () => {
  const app = await setup();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  showNotice.mockClear();
  const first = app.order('folder', ['b', 'a'], now);
  // The second drag is computed from the order the first one already shows.
  expect(app.getState().nodesById.folder?.manualChildOrder).toEqual(['b', 'a']);
  const second = app.order('folder', ['a', 'b'], now);
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
  expect((await snapshot(peer)).nodesById.folder?.manualChildOrder).toEqual(['a', 'b']);
});

it('keeps both of two rapid sequential reading toggles on the same folder', async () => {
  const app = await setup();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const first = app.sequential('folder', true, now);
  const second = app.sequential('folder', false, now);
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
  expect((await snapshot(peer)).nodesById.folder?.sequentialReadingEnabled).toBe(false);
});

it('shows the change while saving and puts it back with a notice when the save fails', async () => {
  const app = await setup();
  const before = app.getState();
  beforeSave = async () => { peer.db.prepare("UPDATE nodes SET sequential_reading_enabled=0 WHERE id='folder'").run(); };
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const saving = app.sequential('folder', true, now);
  expect(app.getState().nodesById.folder?.sequentialReadingEnabled).toBe(true);
  expect(await saving).toBe(false);
  expect(warn).toHaveBeenCalledWith('[persistence] flow source settings save conflict', expect.objectContaining({ reason: 'state_mismatch' }));
  warn.mockRestore();
  expect(app.getState()).toEqual(before);
  expect(showNotice).toHaveBeenCalledOnce();
});
