// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { refreshCompanionWorkspaceSnapshot } from '../shared/platform/companion/companionWorkspaceSnapshotRefresh';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import type { CapacitorCompanionDatabaseOwner } from '../shared/platform/companion/runtime/capacitorCompanionDatabaseOwner';
import { createDisplayLibrary } from '../shared/platform/companion/sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import { useCompanionVirtualFolderLoader } from './useCompanionVirtualFolderLoader';

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null,
  wait: null as Promise<void> | null, read: null as (() => void) | null, queries: 0 }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({}) }));
vi.mock('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => runtime.owner!
}));
vi.mock('../shared/platform/companion/runtime/companionVirtualFolderResults', async original => {
  const actual = await original<typeof import('../shared/platform/companion/runtime/companionVirtualFolderResults')>();
  return { ...actual, loadCompanionVirtualFolderResultIds: async (...args: Parameters<typeof actual.loadCompanionVirtualFolderResultIds>) => {
    const result = await actual.loadCompanionVirtualFolderResultIds(...args);
    runtime.queries += 1;
    const wait = runtime.wait;
    runtime.wait = null;
    runtime.read?.();
    if (wait) await wait;
    return result;
  } };
});

it('requeries database text when a sync refresh publishes while opening a virtual folder', async () => {
  const library = createDisplayLibrary('android');
  runtime.owner = library.owner;
  let release!: () => void;
  let read!: () => void;
  runtime.wait = new Promise<void>(done => { release = done; });
  const reading = new Promise<void>(done => { read = done; });
  runtime.read = read;
  runtime.queries = 0;
  let unmount: (() => void) | undefined;
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now: '2026-10-18T00:00:00Z' });
    await library.owner.runWriter(async db => {
      await db.run(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
        VALUES ('folder', 'folder', 'Search', '', 'now', 'now'),
        ('a', 'topic', 'A', 'needle', 'now', 'now'), ('b', 'topic', 'B', 'other', 'now', 'now')`);
      await db.run('UPDATE nodes SET virtual_filter = ? WHERE id = ?', [JSON.stringify({ version: 1, match: 'all',
        conditions: [{ field: 'text', operator: 'contains', value: 'needle' }] }), 'folder']);
    });
    const snapshot = await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
    const state: NativeCompanionWorkspaceSyncState = { endpoint_url: null, last_synced_at: null,
      remembered_targets: [], sync_events: [], sync_onboarding_status: 'completed', workspace_snapshot: snapshot };
    const hook = renderHook(() => useCompanionVirtualFolderLoader(state));
    unmount = hook.unmount;
    let opening!: Promise<string[]>;
    act(() => { opening = hook.result.current('folder'); });
    await reading;
    await library.owner.runWriter(db => db.transaction(async tx => {
      await tx.run("UPDATE nodes SET content = 'other' WHERE id = 'a'");
      await tx.run("UPDATE nodes SET content = 'needle' WHERE id = 'b'");
    }));
    await act(async () => {
      await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
      release();
      expect(await opening).toEqual(['b']);
    });
    expect(runtime.queries).toBe(2);
    expect(companionWorkspaceSnapshots.getSnapshot()?.virtualResultIdsByNodeId?.folder).toEqual(['b']);
  } finally {
    release();
    unmount?.();
    runtime.wait = null;
    runtime.read = null;
    await library.close();
    runtime.owner = null;
  }
});
