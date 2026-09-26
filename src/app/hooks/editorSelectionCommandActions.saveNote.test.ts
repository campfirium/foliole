import { expect, it, vi } from 'vitest';

import { createSelectionHandlers } from './editorSelectionCommandActions';
import { createExistingHighlightHandlers } from './existingHighlightContextHandlers';

const payload = {
  anchorId: 'anchor-1',
  clozeContent: '[...]',
  entries: [{
    anchorId: 'anchor-1',
    clozeContent: '[...]',
    locator: { from: 0, originalText: 'Alpha', to: 5 },
    range: { from: 0, to: 5 },
    selectionText: 'Alpha'
  }],
  parentNodeId: 'topic-1',
  selectionText: 'Alpha'
};

it.each([
  ['confirmed', 'annotation-1', true],
  ['rejected', null, false]
] as const)('reports %s annotation persistence to the save action', async (_, persistedId, expected) => {
  const createHighlightNodeFromSelection = vi.fn(async () => persistedId);
  const flushPendingEditorDraft = vi.fn(() => false);
  const selectionHandlers = createSelectionHandlers({
    createChildNode: vi.fn(),
    createHighlightNodeFromSelection,
    createQANodeFromSelection: vi.fn(),
    flushPendingEditorDraft,
    onExitImmersiveMode: vi.fn(),
    onSelectNode: vi.fn(),
    runSelectionCommand: vi.fn(),
    runSelectionCommandFromPayloadHandler: vi.fn()
  });
  const handlers = createExistingHighlightHandlers({
    closeContextMenu: vi.fn(),
    contextMenu: { kind: 'selection', payload } as never,
    deleteEditorAnnotationNodes: vi.fn(),
    flushPendingEditorDraft,
    nodesById: {},
    onSelectNode: vi.fn(),
    selectionHandlers,
    updateNodeContent: vi.fn()
  });

  await expect(handlers.handleCreateNote('Reader thought')).resolves.toBe(expected);
  expect(flushPendingEditorDraft).toHaveBeenCalledTimes(1);
  expect(createHighlightNodeFromSelection).toHaveBeenCalledWith(
    'topic-1', 'Alpha\n※ Reader thought', 'anchor-1',
    expect.objectContaining({ kind: 'highlight' }), undefined
  );
});
