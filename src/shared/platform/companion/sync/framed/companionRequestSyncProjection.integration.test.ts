// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import type { DbParams, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import { COMPANION_DATABASE_VERSION } from '../../../../../../lib/platform/nativeCompanionContract.js';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport.js';
import { saveCompanionSyncNodeViewState } from '../../../companionSyncStateWriters.js';
import * as companionRuntime from '../../../companionWorkspaceRuntimeRepository.js';
import { refreshCompanionWorkspaceSnapshot } from '../../companionWorkspaceSnapshotRefresh.js';
import { companionWorkspaceSnapshots } from '../../companionWorkspaceSnapshotStore.js';
import { saveCompanionContentEdit } from '../../editing/companionContentEditing.js';
import { invalidateCompanionReadingScope } from '../../reading/companionReadingScope.js';
import { readCompanionAttachmentReferences } from '../../runtime/companionAttachmentReferenceSnapshot.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';
import { createDisplayLibrary } from '../workspace-state/companionDisplaySnapshotConcurrency.testSupport.js';
import { loadIosCompanionWorkspaceSnapshot } from '../workspace-state/iosCompanionWorkspaceSnapshotStore.js';

it('publishes a scoped projection after a real HTTP body update and agrees with a complete read', async () => {
  invalidateCompanionReadingScope();
  const host = await createCompanionRequestFixture();
  try {
    await host.fixture.right.seed({ nodeId: 'projection-topic', title: 'Unchanged title', content: 'First body' });
    await host.sync();
    const before = await refreshCompanionWorkspaceSnapshot({ kind: 'full' });
    expect(before?.nodesById['projection-topic']).toBeDefined();
    await host.fixture.right.seed({ nodeId: 'projection-topic', title: 'Unchanged title', content: 'Second body' });
    await host.sync();
    const after = await refreshCompanionWorkspaceSnapshot();
    expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id = 'projection-topic'").pluck().get()).toBe('Second body');
    expect(after).toEqual(await loadIosCompanionWorkspaceSnapshot(host.db));
    expect(after?.nodeOrder, 'Ordinary body sync must not reread the complete directory').toBe(before?.nodeOrder);
    expect(companionWorkspaceSnapshots.getSnapshot()).toBe(after);
    const capability = vi.spyOn(companionRuntime, 'isNativeCompanionNodeVersionWriteRuntime').mockReturnValue(true);
    const viewCapability = vi.spyOn(companionRuntime, 'isNativeCompanionViewStateWriteRuntime').mockReturnValue(true);
    try {
      await saveCompanionSyncNodeViewState({ nodeId: 'projection-topic', scrollTop: 250 });
      const baseVersionId = host.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'projection-topic'").pluck().get();
      if (typeof baseVersionId !== 'string') throw new Error('fixture_current_version_missing');
      await saveCompanionContentEdit({ nodeId: 'projection-topic', baseVersionId, versionId: 'mobile-edit',
        content: 'Mobile edited body', updatedAt: new Date().toISOString() });
      await host.sync();
      const final = await refreshCompanionWorkspaceSnapshot();
      expect(final).toEqual(await loadIosCompanionWorkspaceSnapshot(host.db));
      expect(final?.persistedNodeViewById?.['projection-topic']?.scrollTop).toBe(250);
      expect(final?.nodeOrder, 'Scrolling during editing must not force a complete directory read').toBe(after?.nodeOrder);
      const remote = new Database(host.fixture.rightSnapshot.databasePath, { readonly: true });
      try {
        expect(remote.prepare("SELECT content FROM nodes WHERE id = 'projection-topic'").pluck().get()).toBe('Mobile edited body');
        expect(remote.prepare("SELECT current_version_id FROM nodes WHERE id = 'projection-topic'").pluck().get())
          .toBe(host.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'projection-topic'").pluck().get());
      } finally { remote.close(); }
    } finally { capability.mockRestore(); viewCapability.mockRestore(); }
  } finally {
    invalidateCompanionReadingScope();
    await host.close();
  }
}, 30000);

it('finishes a real HTTP update when its snapshot interrupts attachment observation', async () => {
  const host = await createCompanionRequestFixture();
  const library = createDisplayLibrary('android', host.fixture.leftSnapshot.databasePath);
  const owner = getIosCompanionDatabaseOwner();
  try {
    // The shared-schema HTTP fixture starts with the desktop lifecycle marker.
    host.sqlite.pragma(`user_version = ${COMPANION_DATABASE_VERSION}`);
    host.sqlite.prepare("INSERT INTO companion_meta VALUES ('device_id', ?, 'now')").run(host.fixture.leftSnapshot.deviceId);
    await library.owner.open({ expectedHostName: 'Mobile', allowCreate: false, now: '2026-10-19T00:00:00.000Z' });
    const writer = vi.spyOn(owner, 'runWriter').mockImplementation(library.owner.runWriter.bind(library.owner));
    const reading = vi.spyOn(owner, 'read').mockImplementation(library.owner.read.bind(library.owner));
    const snapshots = vi.spyOn(owner, 'readSnapshot').mockImplementation(library.owner.readSnapshot.bind(library.owner));
    try {
      await host.fixture.right.seed({ nodeId: 'scan-topic', title: 'Topic', content: 'First body' });
      await host.sync();
      await host.fixture.right.seed({ nodeId: 'scan-topic', title: 'Topic', content: 'Updated body' });
      let batches = 0;
      snapshots.mockImplementationOnce(async (read, signal) => {
        const original = library.owner.readBackgroundSnapshot.bind(library.owner);
        let foreground: ReturnType<typeof read> | undefined;
        library.owner.readBackgroundSnapshot = (task, backgroundSignal) => original(db => task({
          ...db,
          async query<T extends DbRow>(sql: string, params?: DbParams) {
            const result = await db.query<T>(sql, params);
            if (sql.includes('resource_references, content FROM nodes WHERE id IN')) {
              batches++;
              foreground ??= library.owner.readSnapshot(read, signal);
            }
            return result;
          }
        }), backgroundSignal);
        try {
          expect((await readCompanionAttachmentReferences(library.owner)).storageKeys).toEqual([]);
          if (!foreground) throw new Error('foreground_snapshot_not_requested');
          return await foreground;
        } finally { library.owner.readBackgroundSnapshot = original; }
      });
      await host.sync();
      expect(batches).toBe(1);
      const remote = new Database(host.fixture.rightSnapshot.databasePath, { readonly: true });
      try {
        const sql = "SELECT content, current_version_id FROM nodes WHERE id = 'scan-topic'";
        expect(host.sqlite.prepare(sql).get()).toEqual(remote.prepare(sql).get());
        expect(host.sqlite.prepare(sql).get()).toMatchObject({ content: 'Updated body' });
      } finally { remote.close(); }
      expect((await readCompanionAttachmentReferences(library.owner)).storageKeys).toEqual([]);
    } finally { writer.mockRestore(); reading.mockRestore(); snapshots.mockRestore(); }
  } finally { await library.close(); await host.close(); }
}, 30000);
