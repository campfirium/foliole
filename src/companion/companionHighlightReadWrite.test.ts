import { beforeEach, expect, it, vi } from 'vitest';

import { readCompanionHighlight } from '../shared/platform/companion/reading/companionHighlightRead';
import { getCompanionReadingScope, invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { createStoredSyncState } from '../shared/platform/companionWorkspaceSync.testSupport';

const mocks = vi.hoisted(() => ({ read: vi.fn(), apply: vi.fn(), writer: vi.fn(), version: vi.fn(), native: vi.fn() }));
vi.mock('../shared/platform/companion/runtime/companionWorkspaceNodeStore', () => ({ loadCompanionWorkspaceNode: mocks.read }));
vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({ isAvailableNativeCompanionRuntime: mocks.native }));
vi.mock('../shared/platform/companionSyncObjects', () => ({ applyCompanionSyncNodeVersionsWithinWriterTask: mocks.apply, applyCompanionLocalNodeVersions: mocks.apply }));
vi.mock('../shared/platform/companion/sync/mutation/companionSyncMutationRevision', () => ({ runCompanionOptionalHighValueMutationTask: mocks.writer }));
vi.mock('./companionAnnotationNodeVersion', () => ({ toCompanionNativeNodeVersion: mocks.version }));

import { addNoteToCompanionExistingHighlight, deleteCompanionExistingHighlight } from './companionExistingHighlightPersistence';

function snapshot() {
  const value = createStoredSyncState().workspace_snapshot!;
  value.nodesById.note = { ...value.nodesById['node-1']!, id: 'note', parentNodeId: 'node-1', kind: 'topic',
    content: '', currentVersionId: 'v1', anchorLink: { id: 'anchor', kind: 'highlight', locator: { from: 0, to: 7, originalText: 'Passage' } } };
  return value;
}
const guard = () => ({ nodeId: 'note', scope: getCompanionReadingScope(), versionId: 'v1' });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.native.mockReturnValue(true);
  mocks.writer.mockImplementation((task: () => Promise<unknown>) => task());
  mocks.version.mockImplementation(async (node) => ({ version_id: 'v2', node }));
  mocks.read.mockResolvedValue({ ...snapshot().nodesById.note, content: 'Passage\n※ Saved note' });
});

it('reads one complete annotation and never treats a missing body as an empty note', async () => {
  expect(await readCompanionHighlight(snapshot(), 'note')).toEqual({ note: 'Saved note', guard: guard() });
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith('note');
  mocks.read.mockResolvedValueOnce(null);
  await expect(readCompanionHighlight(snapshot(), 'note')).rejects.toThrow('unavailable');
});

it('uses the Web snapshot without calling the native database', async () => {
  mocks.native.mockReturnValue(false);
  const source = snapshot();
  source.nodesById.note!.content = 'Passage\n※ Web note';
  expect((await readCompanionHighlight(source, 'note')).note).toBe('Web note');
  expect(mocks.read).not.toHaveBeenCalled();
});

it('rejects a draft read at v1 when the current catalog already contains v2', async () => {
  const source = snapshot();
  source.nodesById.note!.currentVersionId = 'v2';
  await expect(addNoteToCompanionExistingHighlight({ deviceId: 'device', nodeId: 'note', note: 'Old draft', originalText: 'Passage', snapshot: source, guard: guard() })).rejects.toThrow('changed');
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('hydrates the complete record before a tombstone write instead of serializing the empty catalog body', async () => {
  await deleteCompanionExistingHighlight({ deviceId: 'device', nodeId: 'note', snapshot: snapshot(), guard: guard() });
  expect(mocks.version).toHaveBeenCalledWith(expect.objectContaining({ content: 'Passage\n※ Saved note', deletedAt: expect.any(String) }), 'device');
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});

it('rejects a write when the library changes while waiting for the writer', async () => {
  let start!: () => void;
  mocks.writer.mockImplementation((task: () => Promise<unknown>) => new Promise((resolve, reject) => {
    start = () => { task().then(resolve, reject); };
  }));
  const pending = deleteCompanionExistingHighlight({ deviceId: 'device', nodeId: 'note', snapshot: snapshot(), guard: guard() });
  invalidateCompanionReadingScope();
  start();
  await expect(pending).rejects.toThrow('changed');
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('rejects a scope change during version creation before publishing the write', async () => {
  mocks.version.mockImplementation(async () => { invalidateCompanionReadingScope(); return { version_id: 'v2' }; });
  await expect(deleteCompanionExistingHighlight({ deviceId: 'device', nodeId: 'note', snapshot: snapshot(), guard: guard() })).rejects.toThrow('changed');
  expect(mocks.apply).not.toHaveBeenCalled();
});
