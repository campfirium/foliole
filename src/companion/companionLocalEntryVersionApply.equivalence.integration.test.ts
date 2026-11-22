// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

// T835: the Dive and Virtual folder source, article image and image cloze writes leave the database exactly as
// the remote apply chain did once they store their versions through the local write path.
const path = vi.hoisted(() => ({ legacy: false, uuid: 0, remoteApplies: 0 }));

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false, convertFileSrc: (url: string) => url },
    registerPlugin: () => ({ ...createCompanionNativeSyncStub(),
      resolveAttachmentResource: () => Promise.resolve({ status: 'ready', resource_url: 'data:image/png;base64,png' }) }) };
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
vi.mock('../../lib/core/sync/localNodeVersionApply', async importOriginal => {
  const original = await importOriginal<typeof import('../../lib/core/sync/localNodeVersionApply')>();
  const { applySyncNodesWithDbPort } = await import('../../lib/core/sync/syncNodeApplyExecutor');
  return { ...original, applyLocalNodeVersionsWithDbPort: (...args: Parameters<typeof original.applyLocalNodeVersionsWithDbPort>) =>
    path.legacy ? applySyncNodesWithDbPort(args[0], args[1], { enqueueSearchInvalidations: false, includeAlreadyApplied: true, operation: args[2] })
      : original.applyLocalNodeVersionsWithDbPort(...args) };
});

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { DIVE_NODE_FILTER } from '../../lib/core/nodes/dive';
import { createManualVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { collectImageMatches } from '../features/editor/model/markdownImageMatches';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { editableNode } from '../shared/platform/companion/editing/companionContentEditingStable.testSupport';
import { createCompanionImageCloze, saveCompanionImageCloze, type CompanionImageClozeRequest } from '../shared/platform/companion/editing/companionImageCloze';
import { deleteCompanionImageCloze } from '../shared/platform/companion/editing/companionImageClozeDeletion';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { commitCompanionImageArticle, readCompanionImageArticle } from '../shared/platform/companion/runtime/companionArticleImageStore';
import { convertCompanionDiveDirectory } from '../shared/platform/companion/runtime/companionDiveConversion';
import { addCompanionDiveSource, removeCompanionDiveSources } from '../shared/platform/companion/runtime/companionDiveSources';
import { changeCompanionIndexSource } from '../shared/platform/companion/runtime/companionIndexSources';
import { settleCompanionNodeVersionCollections } from '../shared/platform/companion/runtime/companionNodeHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { changedCompanionRows, dumpCompanionTables } from '../test/companionLocalNodeVersionApplyEquivalence.testSupport';

const hash = 'a'.repeat(64);
const key = `${hash}.png`;
const content = `Before\n\n![local](asset://${key})\n\nAfter`;
let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; vi.useRealTimers(); vi.restoreAllMocks(); });

const topicVersion = () => library!.database.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get() as string;

function cloze(regionIds: string[]): CompanionImageClozeRequest {
  const image = collectImageMatches(0, content)[0]!;
  return { nodeId: 'new-item', parentNodeId: 'topic', expectedContent: content, expectedVersionId: topicVersion(),
    imageRange: { from: image.from, to: image.to }, scope: getCompanionReadingScope(),
    regions: regionIds.map((id, index) => ({ attachmentId: hash, id, answer: '', x: 0.1 + index * 0.4, y: 0.3, width: 0.3, height: 0.2 })) };
}

async function run(legacy: boolean, steps: () => Promise<unknown>) {
  await library?.close();
  path.legacy = true;
  path.uuid = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-22T00:00:00.000Z'));
  let random = 0;
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() =>
    `00000000-0000-4000-9000-${String(++random).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`);
  library = await createSearchLibrary(40, 64);
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'folder', kind: 'folder', parentNodeId: null, title: 'folder' });
  for (const id of ['a', 'b', 'c']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'topic', parentNodeId: 'folder', title: id });
  await mutateCompanionWorkspace({ type: 'create-dive', nodeId: 'dive', title: 'dive', sourceId: 'b' });
  await mutateCompanionWorkspace({ type: 'create-index', nodeId: 'index', title: 'index' });
  await changeCompanionIndexSource('index', 'c', 'add');
  const topic = await toWorkspaceNativeNodeVersion(editableNode({ content,
    resourceReferences: [{ storage_key: key, original_name: 'Diagram.png', role: 'image' }] }), 'source', 'topic-version');
  await getIosCompanionDatabaseOwner().runWriter(db => applySyncNodesWithDbPort(db, [topic], { enqueueSearchInvalidations: false }), { kind: 'business' });
  await refreshCompanionWorkspaceAfterMutation(null);
  await settleCompanionNodeVersionCollections();
  const before = dumpCompanionTables(library.database);
  path.legacy = legacy;
  path.remoteApplies = 0;
  vi.setSystemTime(new Date(Date.now() + 1000));
  await steps();
  await settleCompanionNodeVersionCollections();
  return changedCompanionRows(before, dumpCompanionTables(library.database));
}

const SCENARIOS: Record<string, () => Promise<unknown>> = {
  'Dive source addition': () => addCompanionDiveSource('dive', 'c'),
  'Dive source removal': () => removeCompanionDiveSources('dive', ['b']),
  'Virtual folder source addition': () => changeCompanionIndexSource('index', 'a', 'add'),
  'Virtual folder source removal': () => changeCompanionIndexSource('index', 'c', 'remove'),
  'Dive to Virtual folder conversion': () => convertCompanionDiveDirectory('dive', 'index', JSON.stringify(DIVE_NODE_FILTER)),
  'Virtual folder to Dive conversion': () => convertCompanionDiveDirectory('index', 'dive', JSON.stringify(createManualVirtualNodeFilter())),
  'article image': async () => {
    const before = (await readCompanionImageArticle('topic'))!;
    await commitCompanionImageArticle('topic', before, { content: `${before.content}\n\n![image](asset://${'b'.repeat(64)}.png)`,
      imageSources: { [`${'b'.repeat(64)}.png`]: 'https://example.com/image.png' } });
  },
  'image cloze creation': () => createCompanionImageCloze(cloze(['region-1', 'region-2'])),
  'image cloze region edit': async () => {
    await createCompanionImageCloze(cloze(['region-1', 'region-2']));
    const request = cloze(['region-1']);
    const before = request.regions[0]!;
    await saveCompanionImageCloze({ ...request, nodeId: 'edit-session', regions: [], edits: [{ before, after: { ...before, x: 0.05, width: 0.35 } }] });
  },
  'image cloze deletion': async () => {
    await createCompanionImageCloze(cloze(['region-1', 'region-2']));
    const request = cloze([]);
    await deleteCompanionImageCloze({ ...request, attachmentId: hash, regionId: 'region-2' });
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
