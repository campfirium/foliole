import { describe, expect, it } from 'vitest';

import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import {
  resolveWorkspaceTopicTreeDropOperation,
  type WorkspaceTopicTreeMoveIntent
} from './workspaceTopicTreeDropOperation';

function node(
  id: string,
  parentNodeId: string | null,
  kind: 'folder' | 'item' | 'topic' = 'topic',
  anchorLink: WorkspaceListNode['anchorLink'] = null
): WorkspaceListNode {
  return {
    anchorLink,
    createdAt: '',
    hasContent: true,
    hasReveal: kind === 'item',
    id,
    kind,
    parentNodeId,
    review: null,
    title: id,
    updatedAt: ''
  };
}

const nodesById = {
  'folder-a': node('folder-a', null, 'folder'),
  'folder-b': node('folder-b', null, 'folder'),
  'folder-child': node('folder-child', 'folder-a', 'folder'),
  'topic-a': node('topic-a', 'folder-a'),
  'topic-b': node('topic-b', 'folder-a'),
  'topic-parent': node('topic-parent', 'folder-a'),
  'topic-child-a': node('topic-child-a', 'topic-parent'),
  'topic-child-b': node('topic-child-b', 'topic-parent'),
  'topic-derived': node('topic-derived', 'topic-parent', 'topic', { id: 'anchor-1', kind: 'highlight' }),
  'node-epub-0123456789abcdef01234567': node('node-epub-0123456789abcdef01234567', 'topic-parent'),
  'item-a': node('item-a', 'folder-a', 'item')
} satisfies WorkspaceListNodesById;

function resolve(overrides: Partial<{
  intent: WorkspaceTopicTreeMoveIntent;
  isManualSort: boolean;
  isVirtualFolderManualOrder: boolean;
  sourceNodeIds: string[];
  targetNodeId: string | null;
}> = {}) {
  return resolveWorkspaceTopicTreeDropOperation({
    activeFolderId: 'folder-a',
    currentOrder: ['folder-child', 'topic-a', 'topic-b', 'topic-parent', 'item-a'],
    intent: overrides.intent ?? 'child',
    isManualSort: overrides.isManualSort ?? false,
    isVirtualFolderManualOrder: overrides.isVirtualFolderManualOrder ?? false,
    nodesById,
    sourceNodeIds: overrides.sourceNodeIds ?? ['topic-a'],
    targetNodeId: overrides.targetNodeId === undefined ? 'topic-b' : overrides.targetNodeId
  });
}

describe('workspace topic tree drop operation', () => {
  it.each([false, true])('routes legal child movement structurally when Manual is %s', (isManualSort) => {
    expect(resolve({ isManualSort })).toBe('structural-move');
  });

  it('reserves direct Folder child edges for Manual order', () => {
    expect(resolve({ intent: 'before' })).toBe('reject');
    expect(resolve({ intent: 'before', isManualSort: true })).toBe('folder-manual-order');
  });

  it.each(['before', 'after'] as const)('keeps nested %s movement structural', (intent) => {
    expect(resolve({ intent, sourceNodeIds: ['topic-child-a'], targetNodeId: 'topic-child-b' }))
      .toBe('structural-move');
  });

  it('keeps cross-parent reparenting structural at Topic and Folder edges', () => {
    expect(resolve({ intent: 'before', targetNodeId: 'topic-child-b' })).toBe('structural-move');
    expect(resolve({ intent: 'before', sourceNodeIds: ['topic-child-a'] })).toBe('structural-move');
  });

  it('allows anchored nodes as sibling references but not child targets', () => {
    expect(resolve({ intent: 'before', sourceNodeIds: ['topic-child-a'], targetNodeId: 'topic-derived' }))
      .toBe('structural-move');
    expect(resolve({ sourceNodeIds: ['topic-child-a'], targetNodeId: 'topic-derived' })).toBe('reject');
  });

  it.each(['topic-derived', 'node-epub-0123456789abcdef01234567'])(
    'rejects protected move source %s',
    (sourceNodeId) => expect(resolve({ sourceNodeIds: [sourceNodeId] })).toBe('reject')
  );

  it('rejects cycles, invalid kinds, root drops, and self targets', () => {
    expect(resolve({ sourceNodeIds: ['topic-parent'], targetNodeId: 'topic-child-a' })).toBe('reject');
    expect(resolve({ sourceNodeIds: ['folder-child'] })).toBe('reject');
    expect(resolve({ intent: 'root', targetNodeId: null })).toBe('reject');
    expect(resolve({ sourceNodeIds: ['topic-b'] })).toBe('reject');
  });

  it('preserves Virtual Folder manual membership order without structural fallback', () => {
    expect(resolve({ intent: 'before', isManualSort: true, isVirtualFolderManualOrder: true }))
      .toBe('folder-manual-order');
    expect(resolve({ isManualSort: true, isVirtualFolderManualOrder: true })).toBe('reject');
  });
});
