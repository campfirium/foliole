// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { refreshCompanionWorkspaceSnapshot } from '../shared/platform/companion/companionWorkspaceSnapshotRefresh';
import {
  companionWorkspaceSnapshots,
  registerCompanionSyncAppliedRefresh
} from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import type { CapacitorCompanionDatabaseOwner } from '../shared/platform/companion/runtime/capacitorCompanionDatabaseOwner';
import { createDisplayLibrary } from '../shared/platform/companion/sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import { useCompanionBrowseSelection } from './useCompanionBrowseSelection';
import { useCompanionVirtualFolderLoader } from './useCompanionVirtualFolderLoader';

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({}) }));
vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => runtime.owner!
}));

const textFilter = (value: string) => JSON.stringify({ version: 1, match: 'all',
  conditions: [{ field: 'text', operator: 'contains', value }] });

let library: ReturnType<typeof createDisplayLibrary>;

beforeEach(async () => {
  library = createDisplayLibrary('android');
  runtime.owner = library.owner;
  await library.owner.open({ expectedHostName: 'display-fixture', now: '2026-10-23T00:00:00Z' });
  await library.owner.runWriter(async db => {
    await db.run(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
      VALUES ('folder', 'folder', 'Search', '', 'now', 'now'),
      ('a', 'topic', 'A', 'needle', 'now', 'now'), ('b', 'topic', 'B', 'other', 'now', 'now')`);
    await db.run('UPDATE nodes SET virtual_filter = ? WHERE id = ?', [textFilter('needle'), 'folder']);
  });
  await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
});

afterEach(async () => {
  await library.close();
  runtime.owner = null;
});

async function openFolder() {
  const hook = renderHook(() => {
    const snapshot = useSyncExternalStore(companionWorkspaceSnapshots.subscribe, companionWorkspaceSnapshots.getSnapshot);
    const state: NativeCompanionWorkspaceSyncState = { endpoint_url: null, last_synced_at: null,
      remembered_targets: [], sync_events: [], sync_onboarding_status: 'completed', workspace_snapshot: snapshot };
    return { open: useCompanionVirtualFolderLoader(state), selection: useCompanionBrowseSelection(snapshot, null) };
  });
  act(() => { hook.result.current.selection.setSelectedBrowseNodeId('folder'); });
  await act(async () => { await hook.result.current.open('folder'); });
  const members = () => hook.result.current.selection.browsedFolder?.items.map(item => item.nodeId);
  expect(members()).toEqual(['a']);
  return { hook, members };
}

async function applySync(nodeIds: string[], write: Parameters<CapacitorCompanionDatabaseOwner['runWriter']>[0]) {
  await library.owner.runWriter(write);
  registerCompanionSyncAppliedRefresh({ kind: 'nodes', nodeIds });
  await act(async () => { await refreshCompanionWorkspaceSnapshot(); });
}

it('publishes database text members for an open folder after sync changes bodies', async () => {
  const { hook, members } = await openFolder();
  await applySync(['a', 'b'], db => db.transaction(async tx => {
    await tx.run("UPDATE nodes SET content = 'other', updated_at = 'later' WHERE id = 'a'");
    await tx.run("UPDATE nodes SET content = 'needle', updated_at = 'later' WHERE id = 'b'");
  }));
  expect(members()).toEqual(['b']);
  hook.unmount();
});

it('publishes members for the new condition after sync changes an open folder filter', async () => {
  const { hook, members } = await openFolder();
  await applySync(['folder'], db => db.run("UPDATE nodes SET virtual_filter = ?, updated_at = 'later' WHERE id = ?", [textFilter('other'), 'folder']));
  expect(members()).toEqual(['b']);
  hook.unmount();
});

it('stops querying a folder after the user leaves it', async () => {
  const { hook } = await openFolder();
  act(() => { hook.result.current.selection.setSelectedBrowseNodeId(null); });
  await applySync(['a'], db => db.run("UPDATE nodes SET content = 'other', updated_at = 'later' WHERE id = 'a'"));
  expect(companionWorkspaceSnapshots.getSnapshot()?.virtualResultIdsByNodeId?.folder).toBeUndefined();
  hook.unmount();
});
