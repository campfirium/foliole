import { afterEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { createSearchLibrary } from '../runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';
import { subscribeCompanionHighValueMutation } from '../sync/mutation/companionSyncMutationRevision';
import { updateIosCompanionWorkspaceSyncMetadata } from '../sync/workspace-state/iosCompanionWorkspaceSyncStateStore';

import { saveCompanionContentEdit } from './companionContentEditing';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
    registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../../appLifecycle', () => ({
  subscribeNativeAppForeground: async () => () => {},
  subscribeNativeAppBackground: async () => () => {}
}));

let library: Awaited<ReturnType<typeof createSearchLibrary>> | undefined;
afterEach(async () => { await library?.close(); library = undefined; vi.restoreAllMocks(); });

function signal() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function prepareTopic() {
  const node = { id: 'topic', content: 'Original', kind: 'topic' as const, title: 'Topic',
    isTitleManual: true, hideTitleHeading: false, parentNodeId: null, reveal: null,
    anchorLink: null, reading: null, review: null,
    createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' };
  const record = await toWorkspaceNativeNodeVersion(node, 'remote', 'base');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [record], {
    enqueueSearchInvalidations: false
  }));
}

it('keeps sync metadata behind a real pending content commit on the shared writer', async () => {
  library = await createSearchLibrary(0);
  await prepareTopic();
  const entered = signal();
  const release = signal();
  const events: string[] = [];
  const originalCommit = library.connection.commitTransaction;
  vi.spyOn(library.connection, 'commitTransaction').mockImplementationOnce(async () => {
    events.push('content-commit-entered');
    entered.resolve();
    await release.promise;
    await originalCommit();
    events.push('content-committed');
  });
  const unsubscribe = subscribeCompanionHighValueMutation(() => events.push('mutation-published'));
  const saving = saveCompanionContentEdit({ nodeId: 'topic', content: 'Edited',
    baseContent: 'Original', baseVersionId: 'base', versionId: 'edited',
    updatedAt: '2026-10-20T00:00:00Z' });
  await entered.promise;
  const metadata = updateIosCompanionWorkspaceSyncMetadata(() => {
    events.push('metadata-writer-entered');
    return { last_synced_at: '2026-10-20T00:00:01Z' };
  });
  try {
    await Promise.resolve();
    expect(events).toEqual(['content-commit-entered']);
  } finally { release.resolve(); }
  try { await Promise.all([saving, metadata]); } finally { unsubscribe(); }
  expect(events.indexOf('metadata-writer-entered')).toBeGreaterThan(events.indexOf('content-committed'));
  expect(events).toContain('mutation-published');
  expect(library.database.prepare('SELECT content FROM nodes WHERE id=?').get('topic'))
    .toEqual({ content: 'Edited' });
  events.length = 0;
  await updateIosCompanionWorkspaceSyncMetadata(() => {
    events.push('uncontended-metadata');
    return { last_synced_at: '2026-10-20T00:00:02Z' };
  });
  expect(events).toEqual(['uncontended-metadata']);
});
