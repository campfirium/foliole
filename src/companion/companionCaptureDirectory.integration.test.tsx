// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { refreshCompanionWorkspaceSnapshot } from '../shared/platform/companion/companionWorkspaceSnapshotRefresh';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { createCompanionCaptureTextSaveHandler } from './companionCaptureTextController';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { useCompanionDirectorySections } from './useCompanionDirectorySections';
import { useCompanionWorkspaceState } from './useCompanionWorkspaceState';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/localization/LocalizationProvider', () => ({ useLocalization: () => ({ locale: 'en' }) }));

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const directory = { entries: [], folders: [] };
beforeEach(async () => { library = await createSearchLibrary(0); });
afterEach(async () => { cleanup(); await library.close(); });

it('publishes a captured topic into an already open Inbox directory without a manual refresh', async () => {
  const initial = await loadCompanionWorkspaceSyncState();
  await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
  const hook = renderHook(() => {
    const [state, setState] = useCompanionWorkspaceState(initial);
    const actions = createWorkspaceSnapshotActions({ state, setState, setError: () => {}, setStatus: () => {},
      setSyncConflictCount: () => {}, setSyncProgress: () => {} });
    const sections = useCompanionDirectorySections({ directory,
      selection: { kind: 'internal', nodeId: 'special-inbox' }, snapshot: state.workspace_snapshot,
      sortKey: 'dateSaved', sortDirection: 'desc' });
    const save = createCompanionCaptureTextSaveHandler({ ...actions, state, bootstrapState: { device_id: 'capture-device' }
    } as ReturnType<typeof useCompanionWorkspaceSync>);
    return { directory: sections, save };
  });
  expect(hook.result.current.directory.sections.flatMap(section => section.items)).toEqual([]);
  let nodeId = '';
  await act(async () => {
    const saved = await hook.result.current.save('Fresh capture');
    expect(saved).toEqual({ nodeId: expect.any(String) });
    if ('nodeId' in saved) nodeId = saved.nodeId;
  });
  expect(library.database.prepare('SELECT parent_id FROM nodes WHERE id = ?').get(nodeId))
    .toEqual({ parent_id: 'special-inbox' });
  expect(hook.result.current.directory.sections.flatMap(section => section.items).map(item => item.nodeId)).toContain(nodeId);
});

it.each(['A quick note.', '# Title\n\nFirst paragraph.\n\nSecond paragraph.'])(
  'persists the opening for captured text and retains it after reloading: %s', async text => {
    const { persistCompanionCapturedText } = await import('./companionCaptureTextActions');
    const initial = await loadCompanionWorkspaceSyncState();
    const expected = text.startsWith('#') ? 'First paragraph. Second paragraph.' : text;
    const saved = await persistCompanionCapturedText({ deviceId: 'capture-device', snapshot: initial.workspace_snapshot, text });
    expect(library.database.prepare('SELECT opening_text FROM nodes WHERE id = ?').get(saved.nodeId))
      .toEqual({ opening_text: expected });
    await reopenSearchLibrary(library.root, '2026-10-30T00:00:00Z');
    const reloaded = await loadCompanionWorkspaceSyncState();
    expect(reloaded.workspace_snapshot?.nodesById[saved.nodeId]?.openingText).toBe(expected);
  });
