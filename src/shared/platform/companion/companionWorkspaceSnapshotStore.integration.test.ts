// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { ROOT_CHILD_ORDER_ID } from '../../../../lib/core/database/parentChildOrder.js';
import { framedSyncObjectStateFactId } from '../../../../lib/core/sync/framedSyncObjectStateInventory.js';
import { appliedStateWorkspaceScope } from '../../../../lib/core/sync/framedSyncWorkspaceScope.js';

import { refreshCompanionWorkspaceSnapshot } from './companionWorkspaceSnapshotRefresh.js';
import {
  companionWorkspaceSnapshots, holdCompanionSyncAppliedRefresh, registerCompanionSyncAppliedRefresh,
  registerCompanionWorkspaceRefresh
} from './companionWorkspaceSnapshotStore.js';
import { invalidateCompanionReadingScope } from './reading/companionReadingScope.js';
import type { CapacitorCompanionDatabaseOwner } from './runtime/capacitorCompanionDatabaseOwner.js';
import { createDisplayLibrary } from './sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport.js';
import { loadIosCompanionWorkspaceSnapshot } from './sync/workspace-state/iosCompanionWorkspaceSnapshotStore.js';

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({})
}));
vi.mock('./runtime/iosCompanionDatabaseBootstrap.js', () => ({
  getIosCompanionDatabaseOwner: () => runtime.owner!
}));

async function orderScope(parentId: string) {
  const hash = '00'.repeat(32);
  const fields = { content_hash: hash, current_version_id: null, deleted_at: null,
    payload_json: '{}', updated_at: '2026-10-28T00:00:00Z' };
  return appliedStateWorkspaceScope({ query: async () => { throw new Error('Unexpected owner lookup'); } } as never, {
    objectType: 'parent_child_order', globalId: parentId, kind: 1, blobs: [],
    sharedStateHash: new Uint8Array(32), factId: framedSyncObjectStateFactId('parent_child_order', hash),
    body: Object.entries(fields).map(([name, value]) => ({ name,
      value: value === null ? { kind: 'null' as const } : { kind: 'string' as const, value } }))
  });
}

it.each(['android', 'ios'] as const)('%s refreshes committed root and nested order after sync releases its hold', async platform => {
  const library = createDisplayLibrary(platform);
  runtime.owner = library.owner;
  let release = () => {};
  try {
    await library.owner.open({ expectedHostName: 'display-fixture', now: '2026-10-28T00:00:00Z' });
    await library.owner.runWriter(async db => {
      for (const [id, parent] of [['folder', null], ['other', null], ['a', 'folder'], ['b', 'folder']]) {
        await db.run(`INSERT INTO nodes (id, parent_id, title, content, created_at, updated_at)
          VALUES (?, ?, ?, 'Preserved body', 'now', 'now')`, [id!, parent ?? null, id!]);
      }
      await db.run(`INSERT OR REPLACE INTO parent_child_order VALUES (?, ?, 'now')`,
        [ROOT_CHILD_ORDER_ID, JSON.stringify(['folder', 'other'])]);
      await db.run(`INSERT OR REPLACE INTO parent_child_order VALUES ('folder', ?, 'now')`, [JSON.stringify(['a', 'b'])]);
    });
    let before = await refreshCompanionWorkspaceSnapshot();
    expect(before?.nodeOrder).toEqual(['folder', 'a', 'b', 'other', 'special-inbox']);
    for (const parent of [ROOT_CHILD_ORDER_ID, 'folder']) {
      const reads = library.directoryQueries();
      const order = parent === ROOT_CHILD_ORDER_ID ? ['other', 'folder'] : ['b', 'a'];
      // A separate connection commits the external change before its notification arrives.
      const writer = new Database(library.file);
      try {
        writer.prepare('UPDATE parent_child_order SET child_ids_json = ? WHERE parent_id = ?')
          .run(JSON.stringify(order), parent);
        expect(writer.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?').pluck().get(parent))
          .toBe(JSON.stringify(order));
      } finally { writer.close(); }
      const outerRelease = holdCompanionSyncAppliedRefresh();
      release = outerRelease;
      const innerRelease = holdCompanionSyncAppliedRefresh();
      registerCompanionSyncAppliedRefresh(await orderScope(parent));
      innerRelease();
      expect(await refreshCompanionWorkspaceSnapshot()).toBe(before);
      expect(library.directoryQueries()).toBe(reads);
      outerRelease();
      outerRelease();
      const after = await refreshCompanionWorkspaceSnapshot();
      expect(after?.nodeOrder).toEqual(parent === ROOT_CHILD_ORDER_ID
        ? ['other', 'folder', 'a', 'b', 'special-inbox'] : ['other', 'folder', 'b', 'a', 'special-inbox']);
      expect(after?.nodesById).toEqual(before?.nodesById);
      expect(after).toEqual(await library.owner.readSnapshot(loadIosCompanionWorkspaceSnapshot));
      const refreshedReads = library.directoryQueries();
      expect(refreshedReads).toBe(reads + 2); // One refresh plus the independent complete read.
      expect(await refreshCompanionWorkspaceSnapshot()).toBe(after);
      expect(library.directoryQueries()).toBe(refreshedReads);
      before = after;
    }
  } finally {
    release();
    invalidateCompanionReadingScope();
    runtime.owner = null;
    await library.close();
  }
});

it('retains a direct structure refresh after a failed read while ignoring an empty notification', async () => {
  invalidateCompanionReadingScope();
  const read = vi.fn(async () => null);
  registerCompanionWorkspaceRefresh({ kind: 'nodes', nodeIds: [] });
  await companionWorkspaceSnapshots.refresh(read);
  expect(read).not.toHaveBeenCalled();
  registerCompanionWorkspaceRefresh(await orderScope(ROOT_CHILD_ORDER_ID));
  read.mockRejectedValueOnce(new Error('Temporary read failure'));
  try {
    await expect(companionWorkspaceSnapshots.refresh(read)).rejects.toThrow('Temporary read failure');
    await companionWorkspaceSnapshots.refresh(read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenLastCalledWith({ current: null, scope: { kind: 'nodes', nodeIds: [], structure: true } });
  } finally { invalidateCompanionReadingScope(); }
});

it('discards a held structure notification when the library changes', async () => {
  invalidateCompanionReadingScope();
  const release = holdCompanionSyncAppliedRefresh();
  const read = vi.fn(async () => null);
  try {
    registerCompanionSyncAppliedRefresh(await orderScope(ROOT_CHILD_ORDER_ID));
    invalidateCompanionReadingScope();
  } finally { release(); }
  await companionWorkspaceSnapshots.refresh(read);
  expect(read).not.toHaveBeenCalled();
});
