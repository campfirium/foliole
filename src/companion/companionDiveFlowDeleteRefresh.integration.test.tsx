// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { useCompanionFlowSession } from './useCompanionFlowSession';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

const now = '2026-10-25T08:00:00.000Z';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
beforeEach(async () => {
  library = await createSearchLibrary(0);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'folder', kind: 'folder', parentNodeId: null, title: 'Folder' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'source', kind: 'topic', parentNodeId: 'folder', title: 'Source' });
  const records = await Promise.all(['a', 'b'].map(id => toWorkspaceNativeNodeVersion({
    id, kind: 'item', parentNodeId: 'source', title: id, content: 'Question', reveal: 'Answer', anchorLink: null,
    reading: null, review: null, isTitleManual: true, hideTitleHeading: false, createdAt: now, updatedAt: now
  }, 'remote')));
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false }), { kind: 'business' });
  await mutateCompanionWorkspace({ type: 'create-dive', nodeId: 'dive', title: 'Dive', sourceId: 'folder' });
});
afterEach(async () => {
  cleanup();
  await runCompanionSyncWriterTask(async () => undefined);
  await library.close();
  vi.useRealTimers();
});

it('moves to the next Dive card once the displayed one is in Trash', async () => {
  const app = renderHook(props => useCompanionFlowSession(props), { initialProps: {
    snapshot: await snapshot(), ready: true, active: true, libraryScope: 'dive-delete' } });
  await waitFor(() => expect(app.result.current.ready).toBe(true));
  await act(async () => { await app.result.current.openDive({ id: 'dive', topicIds: ['folder'] }, undefined, 'review-first'); });
  const first = app.result.current.capture().nodeId!;
  expect(['a', 'b']).toContain(first);

  await mutateCompanionWorkspace({ type: 'delete', nodeId: first }, { session: app.result.current.capture().session, mode: 'review-first' });
  app.rerender({ snapshot: await snapshot(), ready: true, active: true, libraryScope: 'dive-delete' });

  await waitFor(() => expect(app.result.current.capture().nodeId).toBe(first === 'a' ? 'b' : 'a'));
  expect(app.result.current.capture().session.dive?.id).toBe('dive');
});
