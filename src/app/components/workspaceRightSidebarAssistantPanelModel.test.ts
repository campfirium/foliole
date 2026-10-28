import { expect, it } from 'vitest';

import { createAssistantPanelNode as createNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';
import {
  messageCacheReducer,
  resolveAssistantLocation
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

it('removes cached local messages for a deleted history thread', () => {
  const state = messageCacheReducer({}, {
    key: 'thread-1',
    message: { id: 'message-1', role: 'assistant', state: 'ready', text: 'Cached answer' },
    type: 'append'
  });

  expect(messageCacheReducer(state, { key: 'thread-1', type: 'delete' })).toEqual({});
});
