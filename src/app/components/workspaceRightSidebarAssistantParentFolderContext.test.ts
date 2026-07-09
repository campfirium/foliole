import { expect, it } from 'vitest';

import { resolveAssistantWorkspaceContext } from './workspaceRightSidebarAssistantContext';
import { createAssistantPanelNode as createNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';

it('includes bounded parent-folder sibling summaries for active topic turns', () => {
  const context = resolveAssistantWorkspaceContext('active-topic', {
    'active-topic': createNode({
      id: 'active-topic',
      openingText: 'Active opening',
      parentNodeId: 'folder',
      title: 'Active topic'
    }),
    folder: createNode({
      id: 'folder',
      kind: 'folder',
      manualChildOrder: ['sibling-topic', 'active-topic'],
      title: 'Folder'
    }),
    'sibling-topic': createNode({
      id: 'sibling-topic',
      openingText: 'Sibling opening',
      parentNodeId: 'folder',
      title: 'Sibling topic'
    })
  });

  expect(context.parentFolder).toMatchObject({
    childCount: 2,
    children: [
      { nodeId: 'sibling-topic', preview: 'Sibling opening', title: 'Sibling topic' },
      { isActive: true, nodeId: 'active-topic', preview: 'Active opening', title: 'Active topic' }
    ],
    truncated: false
  });
  expect(context.parentFolder?.children[0]).not.toHaveProperty('isActive');
});
