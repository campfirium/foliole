// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport.js';
import * as companionRuntime from '../../../companionWorkspaceRuntimeRepository.js';
import { refreshCompanionWorkspaceSnapshot } from '../../companionWorkspaceSnapshotRefresh.js';
import { companionWorkspaceSnapshots } from '../../companionWorkspaceSnapshotStore.js';
import { saveCompanionContentEdit } from '../../editing/companionContentEditing.js';
import { invalidateCompanionReadingScope } from '../../reading/companionReadingScope.js';
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
    try {
      const baseVersionId = host.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'projection-topic'").pluck().get();
      if (typeof baseVersionId !== 'string') throw new Error('fixture_current_version_missing');
      await saveCompanionContentEdit({ nodeId: 'projection-topic', baseVersionId, versionId: 'mobile-edit',
        content: 'Mobile edited body', updatedAt: new Date().toISOString() });
      await host.sync();
      const final = await refreshCompanionWorkspaceSnapshot();
      expect(final).toEqual(await loadIosCompanionWorkspaceSnapshot(host.db));
      const remote = new Database(host.fixture.rightSnapshot.databasePath, { readonly: true });
      try {
        expect(remote.prepare("SELECT content FROM nodes WHERE id = 'projection-topic'").pluck().get()).toBe('Mobile edited body');
        expect(remote.prepare("SELECT current_version_id FROM nodes WHERE id = 'projection-topic'").pluck().get())
          .toBe(host.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'projection-topic'").pluck().get());
      } finally { remote.close(); }
    } finally { capability.mockRestore(); }
  } finally {
    invalidateCompanionReadingScope();
    await host.close();
  }
}, 30000);
