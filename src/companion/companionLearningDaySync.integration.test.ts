// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { createDailyFlowDayWindow } from '../../lib/core/flow/dailyFlowDayWindow';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { saveCompanionReviewSettings } from '../shared/platform/companion/settings/companionReviewSchedulerSettingsRepository';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { connectCompanionPeer } from '../test/companionDailySync.testSupport';
import { node, open, act as peerAction } from '../test/dailyFlowExceptions.testSupport';

import { persistFlowMutation } from './companionFlowMutation';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub };
});

it('projects peer learning into the changed local boundary and synchronizes the next Read', async () => {
  const library = await createSearchLibrary(0);
  const early = new Date(2026, 10, 3, 7).toISOString();
  const late = new Date(2026, 10, 3, 11).toISOString();
  const now = new Date(2026, 10, 3, 12).toISOString();
  const params = { now, mode: 'recommended' as const };
  try {
    const peers = await connectCompanionPeer(library);
    await saveCompanionReviewSettings({ newDayStartsAtHour: 4 });
    for (const id of ['a', 'b', 'c']) node(peers.desktop, id, 'topic');
    await peers.exchange();
    const first = await open(peers.desktop, early);
    const advanced = await peerAction(peers.desktop, first, 'read', early);
    const desktop = await peerAction(peers.desktop, advanced, 'read', late);
    expect(desktop.readTopicCount).toBe(2);
    const oldMobile = await openCompanionDailyFlow(params);
    await saveCompanionReviewSettings({ newDayStartsAtHour: 10 });
    await peers.exchange();

    const mobile = (await openCompanionDailyFlow(params)).session;
    expect(mobile.dayWindow).not.toEqual(oldMobile.session.dayWindow);
    expect(mobile.dayWindow).toEqual(createDailyFlowDayWindow(now, 10));
    expect(mobile.readTopicCount).toBe(1);
    expect(mobile.currentNodeId).toBe(desktop.currentNodeId);
    const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
    await persistFlowMutation({ action: 'read', nodeId: mobile.currentNodeId!, now, snapshot,
      history: { key: 'learning-settings', mode: params.mode, session: mobile } });
    await peers.exchange();

    expect((await open(peers.desktop, now)).readTopicCount).toBe(3);
    expect((await openCompanionDailyFlow(params)).session.readTopicCount).toBe(2);
    expect((await readDailyFlow(peers.desktop.port))?.session.readTopicCount).toBe(3);
    expect((await readDailyFlow(peers.mobile.port))?.session.readTopicCount).toBe(2);
  } finally {
    await library.close();
    await closeLibraries();
  }
});
