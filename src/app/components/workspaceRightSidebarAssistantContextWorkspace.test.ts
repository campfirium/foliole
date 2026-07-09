import { expect, it } from 'vitest';

import { resolveAssistantWorkspaceContext } from './workspaceRightSidebarAssistantContext';
import { createAssistantPanelNode as createNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';

it('includes bounded top-level material summaries for workspace-level Aide turns', () => {
  const context = resolveAssistantWorkspaceContext(null, {
    child: createNode({
      id: 'child',
      openingText: 'Nested preview',
      parentNodeId: 'root-a',
      title: 'Nested topic'
    }),
    'root-a': createNode({
      id: 'root-a',
      kind: 'folder',
      openingText: 'Root A preview',
      title: 'Root A'
    }),
    'root-b': createNode({
      id: 'root-b',
      openingText: 'Root B preview',
      title: 'Root B'
    })
  });

  expect(context).toMatchObject({
    folder: {
      childCount: 2,
      children: [
        { nodeId: 'root-a', preview: 'Root A preview', title: 'Root A' },
        { nodeId: 'root-b', preview: 'Root B preview', title: 'Root B' }
      ],
      truncated: false
    },
    schemaVersion: 1,
    scope: 'workspace'
  });
});
