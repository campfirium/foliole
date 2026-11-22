// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

// T835: body saves, anchor remaps, body undo and redo, and highlight writes leave the database exactly as the
// remote apply chain did once they store their versions through the local write path.
const path = vi.hoisted(() => ({ legacy: false, uuid: 0, remoteApplies: 0 }));

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/companionUuid', () => ({
  createCompanionUuid: () => `00000000-0000-4000-8000-${String(++path.uuid).padStart(12, '0')}`
}));
vi.mock('../../lib/core/sync/syncNodeApplyExecutor', async importOriginal => {
  const original = await importOriginal<typeof import('../../lib/core/sync/syncNodeApplyExecutor')>();
  return { ...original, applySyncNodesWithDbPort: (...args: Parameters<typeof original.applySyncNodesWithDbPort>) => {
    if (!path.legacy) path.remoteApplies += 1;
    return original.applySyncNodesWithDbPort(...args);
  } };
});
// The remote apply chain is the reference: every local write falls back to it, as the edits did before T835.
vi.mock('../../lib/core/sync/localNodeVersionApply', async importOriginal => {
  const original = await importOriginal<typeof import('../../lib/core/sync/localNodeVersionApply')>();
  const { applySyncNodesWithDbPort } = await import('../../lib/core/sync/syncNodeApplyExecutor');
  return { ...original,
    localNodeVersionsReady: (...args: Parameters<typeof original.localNodeVersionsReady>) => !path.legacy && original.localNodeVersionsReady(...args),
    applyLocalNodeVersionsWithDbPort: (...args: Parameters<typeof original.applyLocalNodeVersionsWithDbPort>) =>
      path.legacy ? applySyncNodesWithDbPort(args[0], args[1], { enqueueSearchInvalidations: false, includeAlreadyApplied: true, operation: args[2] })
        : original.applyLocalNodeVersionsWithDbPort(...args) };
});

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { readCompanionContentSource, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { applyCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistoryReplay';
import { settleCompanionNodeVersionCollections } from '../shared/platform/companion/runtime/companionNodeHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { changedCompanionRows, dumpCompanionTables } from './companionLocalNodeVersionApply.equivalence.testSupport';
import { deleteCompanionExistingHighlight, persistCompanionSelectionAnnotation } from './companionSelectionAnnotationActions';

let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; vi.useRealTimers(); vi.restoreAllMocks(); });

let saves = 0;
async function edit(content: string) {
  const source = await readCompanionContentSource('topic', 'editor');
  vi.setSystemTime(new Date(Date.now() + 1000));
  return saveCompanionContentEdit({ nodeId: 'topic', content, baseContent: source.content, holdId: 'editor',
    baseVersionId: source.versionId, versionId: `body-${++saves}`, updatedAt: new Date().toISOString() });
}

async function annotate(kind: 'highlight' | 'cloze' = 'highlight') {
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  return persistCompanionSelectionAnnotation({ deviceId: 'phone', kind, snapshot, note: 'Comment',
    payload: { parentNodeId: 'topic', selectionText: 'Original', anchorId: `anchor-${kind}`, clozeContent: '[...] body',
      entries: [{ locator: { originalText: 'Original', from: 0, to: 8 } }] } });
}

const replay = (mode: 'undo' | 'redo') => { vi.setSystemTime(new Date(Date.now() + 1000)); return applyCompanionEditHistory('topic', mode); };

async function run(legacy: boolean, steps: () => Promise<unknown>) {
  await library?.close();
  path.legacy = true;
  path.uuid = 0;
  saves = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-22T00:00:00.000Z'));
  let random = 0;
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() =>
    `00000000-0000-4000-9000-${String(++random).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`);
  library = await createSearchLibrary(20, 64);
  const topic = await toWorkspaceNativeNodeVersion({ id: 'topic', content: 'Original body with Bread', kind: 'topic', title: 'Topic',
    isTitleManual: true, hideTitleHeading: false, parentNodeId: null, reveal: null, anchorLink: null, reading: null, review: null,
    createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' }, 'remote', 'base');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [topic], { enqueueSearchInvalidations: false }), { kind: 'business' });
  await refreshCompanionWorkspaceAfterMutation(null);
  await settleCompanionNodeVersionCollections();
  const before = dumpCompanionTables(library.database);
  path.legacy = legacy;
  path.remoteApplies = 0;
  await steps();
  await settleCompanionNodeVersionCollections();
  return changedCompanionRows(before, dumpCompanionTables(library.database));
}

const SCENARIOS: Record<string, () => Promise<unknown>> = {
  'body save': () => edit('Original body with Bread, edited'),
  'body save that moves anchored children': async () => {
    await annotate('highlight');
    await annotate('cloze');
    await edit('Prefix. Original body with Bread');
  },
  'body undo and redo': async () => {
    await edit('First edit');
    await edit('Second edit');
    await replay('undo');
    await replay('undo');
    await replay('redo');
  },
  'highlight creation, undo and redo': async () => {
    await annotate('highlight');
    await replay('undo');
    await replay('redo');
  },
  'highlight deletion and undo': async () => {
    const created = (await annotate('highlight'))!;
    await deleteCompanionExistingHighlight({ deviceId: 'phone', nodeId: created.nodeId,
      snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot });
    await replay('undo');
  }
};

for (const [name, steps] of Object.entries(SCENARIOS)) {
  it(`stores a ${name} exactly as the remote apply chain does`, async () => {
    const legacy = await run(true, steps);
    const local = await run(false, steps);
    // Every write took the local write path rather than falling back to the remote apply chain.
    expect(path.remoteApplies).toBe(0);
    for (const table of Object.keys(legacy)) expect({ table, rows: local[table] }).toEqual({ table, rows: legacy[table] });
  });
}
