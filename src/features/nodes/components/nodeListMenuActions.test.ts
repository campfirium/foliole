import { expect, it, vi } from 'vitest';

import type { WorkspaceListNode, WorkspaceListNodesById } from '../model/workspaceListNode';

import { createDismissEntireTopicAction, createDismissNodeAction, createToggleSequentialReadingAction } from './nodeListMenuActions';

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

it('dismisses only the current menu target', () => {
  const closeContextMenu = vi.fn();
  const dismissNode = vi.fn().mockReturnValue(true);

  createDismissNodeAction('current-topic', dismissNode, closeContextMenu)();

  expect(dismissNode).toHaveBeenCalledExactlyOnceWith('current-topic');
  expect(closeContextMenu).toHaveBeenCalledOnce();
});

it('dismisses an entire topic through one batch action', () => {
  const closeContextMenu = vi.fn();
  const dismissNodes = vi.fn().mockReturnValue(true);
  const reading = {
    intervalDurationMs: 0,
    intervalGrowthFactor: 1,
    lastHandledAt: NOW,
    nextAt: NOW,
    priority: 0,
    readingPosition: 0,
    repetitionCount: 0,
    state: 'active' as const
  };
  const nodesById: WorkspaceListNodesById = {
    child: listNode({ hasContent: true, id: 'child', parentNodeId: 'parent', reading }),
    parent: listNode({ hasContent: true, id: 'parent', reading })
  };

  createDismissEntireTopicAction('parent', nodesById, dismissNodes, closeContextMenu)();

  expect(dismissNodes).toHaveBeenCalledWith(['parent', 'child'], expect.any(String));
  expect(closeContextMenu).toHaveBeenCalledOnce();
});
