// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording';
import { watchCompanionWorkspaceRefreshDegradations } from '../shared/platform/companion/companionWorkspaceRefreshDegradation.testSupport';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { persistCompanionCapturedText } from './companionCaptureTextActions';
import { restoreCompanionTrashNode } from './companionTrashActions';

// Work-amplification check: the quick-capture topic and the Trash sheet's restore, counted, never timed.
const reads = vi.hoisted(() => ({ fullSnapshots: 0 }));

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore', async importOriginal => {
  const original = await importOriginal<typeof import('../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore')>();
  return { ...original, loadIosCompanionWorkspaceSnapshot: (...args: Parameters<typeof original.loadIosCompanionWorkspaceSnapshot>) => {
    reads.fullSnapshots += 1;
    return original.loadIosCompanionWorkspaceSnapshot(...args);
  } };
});

const degradations = watchCompanionWorkspaceRefreshDegradations();
let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
async function openLibrary(size: number) {
  await library?.close();
  // An enlarged library: a whole-library read is the amplification this check counts.
  library = await createSearchLibrary(size, 16);
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'folder', kind: 'folder', parentNodeId: null, title: 'Folder' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'gone', kind: 'topic', parentNodeId: 'folder', title: 'Gone' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'gx', kind: 'item', parentNodeId: 'gone', title: 'gx' });
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'gone' });
  await refreshCompanionWorkspaceAfterMutation(null);
  reads.fullSnapshots = 0;
  degradations.reset();
}
afterEach(async () => { await library?.close(); library = null; });

// Each write refreshes the way its controller does: without the preview once a native write published its nodes.
const WRITES: Record<string, () => Promise<unknown>> = {
  'captured topic': async () => {
    const result = await persistCompanionCapturedText({ deviceId: 'Search', parentNodeId: 'folder', text: 'Captured',
      snapshot: (await refreshCompanionWorkspaceAfterMutation())! });
    return refreshCompanionWorkspaceAfterMutation(result.published ? undefined : result.snapshot);
  },
  'Trash restore': async () => {
    const result = await restoreCompanionTrashNode({ deviceId: 'Search', nodeId: 'gone',
      snapshot: (await refreshCompanionWorkspaceAfterMutation())! });
    return refreshCompanionWorkspaceAfterMutation(result!.published ? undefined : result!.snapshot);
  }
};

async function writeRows(size: number, write: () => Promise<unknown>) {
  await openLibrary(size);
  sqlRecording.start({ label: 'single-write', maxGroups: 2000 });
  try { await write(); } finally { sqlRecording.stop(); }
  return sqlRecording.snapshot()!.groups.reduce((total, group) => total + group.returnedRows, 0);
}

for (const [name, write] of Object.entries(WRITES)) {
  it(`shows a ${name} without reading the whole library`, async () => {
    await openLibrary(100);
    const snapshot = await write() as WorkspaceSnapshot | null;
    expect(reads.fullSnapshots).toBe(0);
    const owner = getIosCompanionDatabaseOwner();
    const complete = await owner.readSnapshot(db => loadIosCompanionWorkspaceSnapshot(db));
    const facts = (value: WorkspaceSnapshot | null) => value && { nodesById: value.nodesById, nodeOrder: value.nodeOrder,
      trashedNodeIds: [...value.trashedNodeIds].sort() };
    expect(facts(snapshot)).toEqual(facts(complete));
  });

  it(`reads the same number of rows for a ${name} however large the library is`, async () => {
    expect(await writeRows(400, write)).toBe(await writeRows(100, write));
  });
}
