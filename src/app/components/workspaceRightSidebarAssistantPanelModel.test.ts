import { expect, it } from 'vitest';

import { createAssistantPanelNode as createNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';
import {
  messageCacheReducer,
  resolveAssistantLocation,
  resolveAssistantTurnWorkspaceContext,
  resolveAssistantWorkspaceContextForLocation
} from './workspaceRightSidebarAssistantPanelModel';

it('uses concrete Foliole nodes as assistant thread locations', () => {
  const nodesById = {
    anchor: createNode({
      anchorLink: { id: 'anchor-1', kind: 'highlight' },
      id: 'anchor',
      parentNodeId: 'topic',
      title: 'Anchor'
    }),
    folder: createNode({ id: 'folder', kind: 'folder', title: 'Folder' }),
    inbox: createNode({ id: 'inbox', kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
    topic: createNode({ id: 'topic', title: 'Topic' })
  };

  expect(resolveAssistantLocation('topic', nodesById)).toEqual({ nodeId: 'topic', type: 'node' });
  expect(resolveAssistantLocation('folder', nodesById)).toEqual({ nodeId: 'folder', type: 'node' });
  expect(resolveAssistantLocation('inbox', nodesById)).toEqual({ nodeId: 'inbox', type: 'node' });
  expect(resolveAssistantLocation('anchor', nodesById)).toEqual({ nodeId: 'anchor', type: 'node' });
});

it('falls back to workspace when there is no active node', () => {
  expect(resolveAssistantLocation(null, {})).toEqual({ type: 'workspace' });
  expect(resolveAssistantLocation('missing', {})).toEqual({ type: 'workspace' });
});

it('marks a saved topic location as missing when the topic is unavailable', () => {
  expect(resolveAssistantWorkspaceContextForLocation(
    { nodeId: 'missing-topic', type: 'node' },
    'current-topic',
    { 'current-topic': createNode({ id: 'current-topic', title: 'Current' }) },
    null
  )).toEqual({
    activeNodeId: 'missing-topic',
    document: { bodyStatus: 'missing' },
    schemaVersion: 1,
    scope: 'node'
  });
});

it('uses the current main panel context when continuing a saved thread', () => {
  const visiblePanelContext = {
    activeKind: 'folder',
    activeNodeId: 'special-virtual-shelved',
    activeTitle: 'Shelved',
    folder: { childCount: 1, children: [], truncated: false },
    path: ['Shelved'],
    schemaVersion: 1 as const,
    scope: 'node' as const
  };

  expect(resolveAssistantTurnWorkspaceContext({
    activeNodeId: null,
    editorAdapter: null,
    location: { type: 'workspace' },
    nodesById: {},
    selectedRecord: {
      agentToolVersion: 1,
      archivedAt: null,
      continuedFromThreadId: null,
      createdAt: '2026-07-07T00:00:00.000Z',
      deletedAt: null,
      lastOpenedAt: '2026-07-07T00:00:00.000Z',
      location: { type: 'workspace' },
      preview: 'Existing prompt',
      provider: 'codex-app-server',
      providerThreadId: 'thread-1',
      readError: null,
      readState: 'available',
      status: 'active',
      title: 'Existing thread',
      updatedAt: '2026-07-07T00:00:00.000Z'
    },
    workspaceContextOverride: visiblePanelContext
  })).toBe(visiblePanelContext);
});

it('removes cached local messages for a deleted history thread', () => {
  const state = messageCacheReducer({}, {
    key: 'thread-1',
    message: { id: 'message-1', role: 'assistant', state: 'ready', text: 'Cached answer' },
    type: 'append'
  });

  expect(messageCacheReducer(state, { key: 'thread-1', type: 'delete' })).toEqual({});
});
