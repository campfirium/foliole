import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSelectNode } from './appControllerTrashViewHandlers';

function createSelectNodeHarness(args: {
  anchorLink: {
    id: string;
    kind: 'highlight' | 'cloze';
    locator: { from: number; originalText: string; to: number } | { page: number; x: number; y: number };
  };
  parentNodeId: string;
}) {
  const handleSelectNode = vi.fn();
  const closeVirtualView = vi.fn();
  const flushPendingEditorDraft = vi.fn();
  const setIsViewingTrashNode = vi.fn();
  const setNodeViewState = vi.fn();

  const selectNode = createSelectNode({
    nav: { handleSelectNode },
    runtime: { flushPendingEditorDraft, setIsViewingTrashNode },
    virtualView: { closeVirtualView },
    ws: {
      nodeViewById: {},
      nodesById: {
        'highlight-node': {
          anchorLink: args.anchorLink,
          parentNodeId: args.parentNodeId
        }
      },
      setNodeViewState
    }
  } as never);

  return { closeVirtualView, flushPendingEditorDraft, handleSelectNode, selectNode, setIsViewingTrashNode, setNodeViewState };
}

function expectDirectChildOpen(kind: 'highlight' | 'cloze') {
  const { closeVirtualView, handleSelectNode, selectNode, setIsViewingTrashNode, setNodeViewState } = createSelectNodeHarness({
    anchorLink: {
      id: `${kind}-2`,
      kind,
      locator: { from: 6, originalText: 'Beta', to: 10 }
    },
    parentNodeId: 'text-parent'
  });

  selectNode('highlight-node');

  expect(setIsViewingTrashNode).toHaveBeenCalledWith(false);
  expect(closeVirtualView).toHaveBeenCalledTimes(1);
  expect(setNodeViewState).not.toHaveBeenCalled();
  expect(handleSelectNode).toHaveBeenCalledWith('highlight-node', null);
}

function createRegularNodeSelectHarness() {
  const handleSelectNode = vi.fn();
  const closeVirtualView = vi.fn();
  const flushPendingEditorDraft = vi.fn();
  const setIsViewingTrashNode = vi.fn();
  const setNodeViewState = vi.fn();
  const selectNode = createSelectNode({
    nav: { handleSelectNode },
    runtime: { flushPendingEditorDraft, setIsViewingTrashNode },
    virtualView: { closeVirtualView },
    ws: {
      nodeViewById: {},
      nodesById: {
        'regular-node': {
          id: 'regular-node',
          anchorLink: null,
          parentNodeId: null,
          specialKind: null
        }
      },
      setNodeViewState
    }
  } as never);
  return { closeVirtualView, handleSelectNode, selectNode, setIsViewingTrashNode, setNodeViewState };
}

function createParentReuseHarness() {
  const handleSelectNode = vi.fn();
  const closeVirtualView = vi.fn();
  const flushPendingEditorDraft = vi.fn();
  const setIsViewingTrashNode = vi.fn();
  const setNodeViewState = vi.fn();
  const selectNode = createSelectNode({
    nav: { handleSelectNode },
    runtime: { flushPendingEditorDraft, setIsViewingTrashNode },
    virtualView: { closeVirtualView },
    ws: {
      activeNodeId: 'child-node',
      nodeViewById: {},
      nodesById: {
        'child-node': {
          anchorLink: {
            id: 'child-hl-1',
            kind: 'highlight',
            locator: { from: 42, originalText: 'Needle', to: 48 }
          },
          id: 'child-node',
          parentNodeId: 'parent-node',
          specialKind: null
        },
        'parent-node': {
          anchorLink: null,
          id: 'parent-node',
          parentNodeId: null,
          specialKind: null
        }
      },
      setNodeViewState
    }
  } as never);
  return { closeVirtualView, handleSelectNode, selectNode, setIsViewingTrashNode, setNodeViewState };
}

describe('createSelectNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens a text highlight child node directly', () => {
    expectDirectChildOpen('highlight');
  });

  it('opens a text cloze child node directly', () => {
    expectDirectChildOpen('cloze');
  });

  it('forwards external focus anchor when opening a regular node', () => {
    const focusAnchor = {
      id: 'hl-3',
      kind: 'highlight' as const,
      locator: { from: 14, originalText: 'Gamma', to: 19 }
    };
    const { closeVirtualView, handleSelectNode, selectNode, setIsViewingTrashNode, setNodeViewState } =
      createRegularNodeSelectHarness();

    selectNode('regular-node', focusAnchor);

    expect(setIsViewingTrashNode).toHaveBeenCalledWith(false);
    expect(closeVirtualView).toHaveBeenCalledTimes(1);
    expect(setNodeViewState).not.toHaveBeenCalled();
    expect(handleSelectNode).toHaveBeenCalledWith('regular-node', focusAnchor);
  });

  it('reuses the active child anchor when opening its parent without an explicit focus anchor', () => {
    const { closeVirtualView, handleSelectNode, selectNode, setIsViewingTrashNode, setNodeViewState } =
      createParentReuseHarness();

    selectNode('parent-node');

    expect(setIsViewingTrashNode).toHaveBeenCalledWith(false);
    expect(closeVirtualView).toHaveBeenCalledTimes(1);
    expect(setNodeViewState).not.toHaveBeenCalled();
    expect(handleSelectNode).toHaveBeenCalledWith('parent-node', {
      id: 'child-hl-1',
      kind: 'highlight',
      locator: { from: 42, originalText: 'Needle', to: 48 }
    });
  });
});
