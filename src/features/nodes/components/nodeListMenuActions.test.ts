import { expect, it, vi } from 'vitest';

import type { WorkspaceListNode, WorkspaceListNodesById } from '../model/workspaceListNode';

import { createToggleSequentialReadingAction } from './nodeListMenuActions';

const NOW = '2026-05-24T00:00:00.000Z';

function listNode(overrides: Partial<WorkspaceListNode>): WorkspaceListNode {
  return {
    createdAt: NOW,
    hasContent: false,
    hasReveal: false,
    id: 'node',
    kind: 'topic',
    parentNodeId: null,
    review: null,
    title: 'Node',
    updatedAt: NOW,
    ...overrides
  };
}

it('enables sequential reading for an empty source topic without confirmation', () => {
  const closeContextMenu = vi.fn();
  const confirmSpy = vi.spyOn(window, 'confirm');
  const setNodeSequentialReading = vi.fn().mockReturnValue(true);
  const nodesById: WorkspaceListNodesById = {
    folder: listNode({ id: 'folder', kind: 'folder', title: 'Folder' }),
    source: listNode({ id: 'source', parentNodeId: 'folder', title: 'Source topic' })
  };

  createToggleSequentialReadingAction({
    closeContextMenu,
    nodesById,
    primaryTargetId: 'source',
    setNodeSequentialReading
  })();

  expect(confirmSpy).not.toHaveBeenCalled();
  expect(setNodeSequentialReading).toHaveBeenCalledWith('source', true);
  expect(closeContextMenu).toHaveBeenCalledOnce();
});
