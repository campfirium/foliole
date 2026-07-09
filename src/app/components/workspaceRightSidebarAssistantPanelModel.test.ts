import { expect, it } from 'vitest';

import { createAssistantPanelNode as createNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';
import {
  resolveAssistantLocation,
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
