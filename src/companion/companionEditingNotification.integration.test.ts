import { afterEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { subscribeCompanionHighValueMutation } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';

const maintenance = vi.hoisted(() => ({ wait: null as Promise<void> | null, entered: false }));
vi.mock('../../lib/core/sync/nodeVersionPayloadCollector', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/core/sync/nodeVersionPayloadCollector')>();
  return { ...actual, collectNodeVersionPayloads: async (...args: Parameters<typeof actual.collectNodeVersionPayloads>) => {
    if (args[2] === 32) {
      maintenance.entered = true;
      await maintenance.wait;
    }
    return actual.collectNodeVersionPayloads(...args);
  } };
});
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
    registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; maintenance.wait = null; });

it('announces committed input before retained-body maintenance finishes', async () => {
  library = await createSearchLibrary(0);
  const node = { id: 'topic', content: 'Original', kind: 'topic' as const, title: 'Topic',
    isTitleManual: true, hideTitleHeading: false, parentNodeId: null, reveal: null, anchorLink: null,
    reading: null, review: null, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' };
  const record = await toWorkspaceNativeNodeVersion(node, 'remote', 'base');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
  let release = () => {};
  maintenance.wait = new Promise<void>(resolve => { release = resolve; });
  maintenance.entered = false;
  const observed: unknown[] = [];
  const unsubscribe = subscribeCompanionHighValueMutation(() => {
    observed.push(library!.database.prepare('SELECT content FROM nodes WHERE id = ?').get('topic'));
  });
  const saving = saveCompanionContentEdit({ nodeId: 'topic', content: 'Committed input',
    versionId: 'edited', baseVersionId: 'base', updatedAt: '2026-10-17T00:00:00Z' });
  try {
    await vi.waitFor(() => expect(maintenance.entered).toBe(true));
    expect(observed).toEqual([{ content: 'Committed input' }]);
  } finally {
    release();
    await saving;
    unsubscribe();
  }
  expect(observed).toHaveLength(1);
});
