// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { loadDerivedNodeOrderWithDbPort } from '../../lib/core/database/parentChildOrder';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording';
import { DIVE_NODE_FILTER } from '../../lib/core/nodes/dive';
import { createManualVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { convertCompanionDiveDirectory } from '../shared/platform/companion/runtime/companionDiveConversion';
import { changeCompanionIndexSource } from '../shared/platform/companion/runtime/companionIndexSources';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

// Work-amplification check WA-047, Dive and Virtual folder conversion on the phone: counted, never timed.
const reads = vi.hoisted(() => ({ fullSnapshots: 0, orderDerivations: 0 }));

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
vi.mock('../../lib/core/database/parentChildOrder', async importOriginal => {
  const original = await importOriginal<typeof import('../../lib/core/database/parentChildOrder')>();
  return { ...original, loadDerivedNodeOrderWithDbPort: (...args: Parameters<typeof original.loadDerivedNodeOrderWithDbPort>) => {
    reads.orderDerivations += 1;
    return original.loadDerivedNodeOrderWithDbPort(...args);
  } };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; });

/** `index` is a Virtual folder only when `withIndex`; without it the conversion of `dive` creates the Virtual root. */
async function openLibrary(size: number, withIndex = true) {
  await library?.close();
  // An enlarged library: a whole-library read is the amplification this check counts.
  library = await createSearchLibrary(size, 16);
  library.database.prepare("INSERT INTO nodes (id,kind,title,content,created_at,updated_at) VALUES ('bulk','folder','bulk','','0','0')").run();
  library.database.prepare("UPDATE nodes SET parent_id = 'bulk' WHERE parent_id IS NULL AND id NOT LIKE 'special-%' AND id != 'bulk'").run();
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'folder', kind: 'folder', parentNodeId: null, title: 'folder' });
  for (const id of ['a', 'b', 'c']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'topic', parentNodeId: 'folder', title: id });
  await mutateCompanionWorkspace({ type: 'create-dive', nodeId: 'dive', title: 'dive', sourceId: 'b' });
  if (withIndex) {
    await mutateCompanionWorkspace({ type: 'create-index', nodeId: 'index', title: 'index' });
    await changeCompanionIndexSource('index', 'c', 'add');
  }
  await refreshCompanionWorkspaceAfterMutation(null);
  reads.fullSnapshots = 0;
  reads.orderDerivations = 0;
}

const facts = (value: WorkspaceSnapshot | null) => value && { ...value, trashedNodeIds: [...value.trashedNodeIds].sort() };
const completeSnapshot = () => getIosCompanionDatabaseOwner().readSnapshot(db => loadIosCompanionWorkspaceSnapshot(db));

async function expectCompleteReread(snapshot: WorkspaceSnapshot | null) {
  const owner = getIosCompanionDatabaseOwner();
  expect(await owner.read(db => owner.readNodeOrder(db)))
    .toEqual(await owner.readSnapshot(db => loadDerivedNodeOrderWithDbPort(db, undefined, true)));
  expect(facts(snapshot)).toEqual(facts(await completeSnapshot()));
}

// A Dive and a manual Virtual folder carry their sources across; neither has children, so the write and the
// refresh touch only the folder and the two parents it leaves and enters.
const CONVERSIONS: Record<string, { withIndex: boolean; run: () => Promise<unknown>; parent: string | null }> = {
  'Dive into a Virtual folder': { withIndex: true, parent: VIRTUAL_ROOT_NODE_ID,
    run: () => convertCompanionDiveDirectory('dive', 'index', JSON.stringify(DIVE_NODE_FILTER)) },
  'Dive into the first Virtual folder': { withIndex: false, parent: VIRTUAL_ROOT_NODE_ID,
    run: () => convertCompanionDiveDirectory('dive', 'index', JSON.stringify(DIVE_NODE_FILTER)) },
  'Virtual folder into a Dive': { withIndex: true, parent: null,
    run: () => convertCompanionDiveDirectory('index', 'dive', JSON.stringify(createManualVirtualNodeFilter())) }
};

async function writeRows(size: number, conversion: typeof CONVERSIONS[string]) {
  await openLibrary(size, conversion.withIndex);
  sqlRecording.start({ label: 'conversion', maxGroups: 2000 });
  try {
    await conversion.run();
    await refreshCompanionWorkspaceAfterMutation();
  } finally { sqlRecording.stop(); }
  return sqlRecording.snapshot()!.groups.reduce((total, group) => total + group.returnedRows, 0);
}

for (const [name, conversion] of Object.entries(CONVERSIONS)) {
  it(`publishes a ${name} conversion without reading or ordering the whole library`, async () => {
    await openLibrary(100, conversion.withIndex);
    await conversion.run();
    const snapshot = await refreshCompanionWorkspaceAfterMutation();
    expect(reads).toEqual({ fullSnapshots: 0, orderDerivations: 0 });
    const converted = name.startsWith('Dive') ? 'dive' : 'index';
    expect(snapshot!.nodesById[converted]!.parentNodeId).toBe(conversion.parent);
    await expectCompleteReread(snapshot);
  });

  it(`reads the same number of rows for a ${name} conversion however large the library is`, async () => {
    expect(await writeRows(400, conversion)).toBe(await writeRows(100, conversion));
  });
}

// A Virtual folder that matches by text or collection becomes a Dive of the topics it matches now. Matching a filter
// against the library is a library-wide question, so the write reads the library once; the refresh merges the one folder.
it('reads the whole library once to convert a filtered Virtual folder into a Dive and merges the refresh', async () => {
  await openLibrary(100);
  const filter = { version: 1, match: 'all', conditions: [{ field: 'text', operator: 'contains', value: 'b' }] };
  library!.database.prepare('UPDATE nodes SET virtual_filter = ? WHERE id = ?').run(JSON.stringify(filter), 'index');
  await refreshCompanionWorkspaceAfterMutation(null);
  reads.fullSnapshots = 0;
  await convertCompanionDiveDirectory('index', 'dive', JSON.stringify(filter));
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(reads.fullSnapshots).toBe(1);
  expect(snapshot!.nodesById.index!.manualChildOrder).toContain('b');
  expect(facts(snapshot)).toEqual(facts(await completeSnapshot()));
});
