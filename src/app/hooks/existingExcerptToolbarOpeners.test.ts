import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { openPdfExcerptToolbar, openWholeImageExcerptToolbar } from './existingExcerptToolbarOpeners';

vi.mock('../../shared/platform/workspaceRuntimeRepository', () => ({
  hasWorkspaceRuntimeRepository: () => true
}));

vi.mock('../../store/workspaceNodePreparation', () => ({
  ensureWorkspaceNodeDocumentReady: vi.fn()
}));

function createPdfImageExcerpt(content: string): Node {
  return {
    anchorLink: {
      id: 'pdf-image-anchor',
      kind: 'image-excerpt' as const,
      locator: { height: 0.2, page: 1, width: 0.3, x: 0.1, y: 0.2 }
    },
    bodyStatus: content ? 'ready' as const : 'missing' as const,
    content,
    createdAt: '2026-08-29T00:00:00.000Z',
    hasContent: true,
    id: 'pdf-image-excerpt',
    kind: 'topic' as const,
    parentNodeId: 'pdf-source',
    reveal: null,
    review: null,
    title: 'Image excerpt',
    updatedAt: '2026-08-29T00:00:00.000Z'
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function createWholeImageFixture() {
  const image = '![Cover](asset://cover.png)';
  const loaded: Node = { ...createPdfImageExcerpt(`${image}\n※ Preserved image note`), id: 'whole-image',
    parentNodeId: 'image-source', anchorLink: { id: 'anchor', kind: 'highlight',
      locator: { from: 0, to: image.length, originalText: image } },
    imageRegions: [{ attachmentId: 'cover', regions: [{ id: 'region', height: 1, width: 1, x: 0, y: 0 }] }] };
  const unloaded = { ...loaded, content: '', bodyStatus: 'missing' as const };
  const parent: Node = { ...loaded, id: 'image-source', parentNodeId: null, anchorLink: null, imageRegions: null };
  const other: Node = { ...parent, id: 'other-source' };
  useWorkspaceStore.setState((state) => ({ ...state, activeNodeId: 'image-source',
    nodeOrder: [...state.nodeOrder.filter((id) => ![parent.id, loaded.id, other.id].includes(id)), parent.id, loaded.id, other.id],
    nodesById: { ...state.nodesById, [parent.id]: parent, [loaded.id]: unloaded, [other.id]: other }, trashedNodeIds: [] }));
  const target = document.createElement('div');
  target.dataset.regionId = 'region';
  const setContextMenu = vi.fn();
  const args = { activeNodeId: 'image-source', nodesById: { [loaded.id]: unloaded },
    setContextMenu, trashedNodeIds: [] };
  return { args, loaded, setContextMenu, target };
}

it.each(['region', 'stored-region'])('loads a cold whole-image annotation with body region %s before exposing its note', async (regionId) => {
  const { args, loaded, setContextMenu, target } = createWholeImageFixture();
  const prepared = { ...loaded, imageRegions: loaded.imageRegions!.map((group) => ({ ...group,
    regions: group.regions.map((region) => ({ ...region, id: regionId })) })) };
  vi.mocked(ensureWorkspaceNodeDocumentReady).mockImplementation(async () => {
    useWorkspaceStore.setState((state) => ({ ...state, rendererBoundaryKeepNodeIds: [loaded.id],
      nodesById: { ...state.nodesById, [loaded.id]: prepared } }));
    return null;
  });
  await expect(openWholeImageExcerptToolbar(args, new MouseEvent('click'), target)).resolves.toBe(true);
  expect(ensureWorkspaceNodeDocumentReady).toHaveBeenCalledWith(loaded.id, { keepWarm: true });
  expect(setContextMenu).toHaveBeenCalledWith(expect.objectContaining({
    existingHighlight: expect.objectContaining({ content: loaded.content, note: 'Preserved image note', nodeId: loaded.id })
  }));
});

it.each(['deleted', 'navigated'])('keeps a late whole-image body from reopening after the user %s', async (change) => {
  const { args, loaded, setContextMenu, target } = createWholeImageFixture();
  vi.mocked(ensureWorkspaceNodeDocumentReady).mockImplementation(async () => {
    useWorkspaceStore.setState((state) => ({ ...state, rendererBoundaryKeepNodeIds: [loaded.id],
      activeNodeId: change === 'navigated' ? 'other-source' : state.activeNodeId,
      trashedNodeIds: change === 'deleted' ? [loaded.id] : [],
      nodesById: { ...state.nodesById, [loaded.id]: loaded } }));
    return null;
  });
  await expect(openWholeImageExcerptToolbar(args, new MouseEvent('click'), target)).resolves.toBe(false);
  expect(setContextMenu).not.toHaveBeenCalled();
});

it.each(['bounds changed', 'duplicate target'])('refuses a prepared image annotation when %s', async (change) => {
  const { args, loaded, setContextMenu, target } = createWholeImageFixture();
  const prepared = { ...loaded, imageRegions: loaded.imageRegions!.map((group) => ({ ...group,
    regions: group.regions.map((region) => ({ ...region, width: change === 'bounds changed' ? 0.5 : region.width })) })) };
  vi.mocked(ensureWorkspaceNodeDocumentReady).mockImplementation(async () => {
    useWorkspaceStore.setState((state) => ({ ...state, rendererBoundaryKeepNodeIds: [loaded.id],
      nodeOrder: [...state.nodeOrder, 'late-duplicate'],
      nodesById: { ...state.nodesById, [loaded.id]: prepared,
        ...(change === 'duplicate target' ? { 'late-duplicate': { ...loaded, id: 'late-duplicate' } } : {}) } }));
    return null;
  });
  await expect(openWholeImageExcerptToolbar(args, new MouseEvent('click'), target)).resolves.toBe(false);
  expect(setContextMenu).not.toHaveBeenCalled();
});

it('loads an unloaded PDF excerpt body before opening its existing annotation toolbar', async () => {
  const unloadedNode = createPdfImageExcerpt('');
  const loadedNode = createPdfImageExcerpt('![Image excerpt](asset://crop.png)\n※ Diagram thought');
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodesById: { ...state.nodesById, [loadedNode.id]: unloadedNode }
  }));
  vi.mocked(ensureWorkspaceNodeDocumentReady).mockImplementation(async () => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      nodesById: { ...state.nodesById, [loadedNode.id]: loadedNode },
      rendererBoundaryKeepNodeIds: [loadedNode.id]
    }));
    return null;
  });
  const target = document.createElement('span');
  target.dataset.pdfHighlightNodeId = loadedNode.id;
  target.getBoundingClientRect = () => ({
    bottom: 120, height: 20, left: 40, right: 140, top: 100, width: 100, x: 40, y: 100,
    toJSON: () => undefined
  });
  const setContextMenu = vi.fn();

  const opened = openPdfExcerptToolbar({
    activeNodeId: 'pdf-source',
    nodesById: { [loadedNode.id]: unloadedNode } as never,
    setContextMenu,
    trashedNodeIds: []
  }, new MouseEvent('mouseup', { clientX: 80, clientY: 110 }), target);

  await expect(opened).resolves.toBe(true);
  expect(ensureWorkspaceNodeDocumentReady).toHaveBeenCalledWith(loadedNode.id, { keepWarm: true });
  expect(setContextMenu).toHaveBeenCalledWith(expect.objectContaining({
    existingHighlight: expect.objectContaining({
      content: loadedNode.content,
      nodeId: loadedNode.id,
      note: 'Diagram thought'
    }),
    mode: 'existing-highlight-toolbar'
  }));
});
