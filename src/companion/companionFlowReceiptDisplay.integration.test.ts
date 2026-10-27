// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { applyCompanionFlowReceipt, openCompanionDailyFlowForDisplay } from '../shared/platform/companion/runtime/companionDailyFlowDisplay';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const now = '2026-10-26T08:00:00.000Z';
beforeEach(async () => {
  library = await createSearchLibrary(2, 32);
  library.database.prepare('UPDATE nodes SET created_at=?, updated_at=?').run(now, now);
});
afterEach(async () => { vi.restoreAllMocks(); await library.close(); });

it('uses only learning patches for a known mobile display and hydrates a missing current node separately', async () => {
  const initial = (await refreshCompanionWorkspaceAfterMutation())!;
  const reader = vi.spyOn(getIosCompanionDatabaseOwner(), 'readSnapshot');
  const opened = await openCompanionDailyFlowForDisplay({ now, mode: 'recommended' });
  const id = opened.session.currentNodeId!;
  expect(id).toBeTruthy();
  expect(opened).not.toHaveProperty('nodes');
  expect(reader).not.toHaveBeenCalled();
  const known = companionWorkspaceSnapshots.getSnapshot();
  await openCompanionDailyFlowForDisplay({ now, mode: 'recommended' });
  expect(companionWorkspaceSnapshots.getSnapshot()).toBe(known);
  const concurrent = { ...initial.nodesById[id]!, title: 'Concurrent title', content: 'Concurrent body' };
  companionWorkspaceSnapshots.reset({ ...initial, nodesById: { ...initial.nodesById, [id]: concurrent } });
  await applyCompanionFlowReceipt(opened, initial);
  expect(companionWorkspaceSnapshots.getSnapshot()!.nodesById[id]).toMatchObject({ title: 'Concurrent title', content: 'Concurrent body' });
  const nodesById = { ...initial.nodesById };
  delete nodesById[id];
  companionWorkspaceSnapshots.reset({ ...initial, nodesById });
  await openCompanionDailyFlowForDisplay({ now, mode: 'recommended' });
  expect(companionWorkspaceSnapshots.getSnapshot()!.nodesById[id]).toMatchObject({ id, title: initial.nodesById[id]!.title, kind: 'topic' });
  expect(reader).toHaveBeenCalled();
});
