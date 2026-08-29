import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { openPdfExcerptToolbar } from './existingExcerptToolbarOpeners';

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
