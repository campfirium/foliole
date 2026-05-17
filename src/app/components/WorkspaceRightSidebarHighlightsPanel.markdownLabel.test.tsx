import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { WorkspaceRightSidebarHighlightsPanel } from './WorkspaceRightSidebarHighlightsPanel';

const BASE_NODE: Node = {
  kind: 'topic',
  content: '',
  createdAt: '2026-03-24T08:00:00.000Z',
  id: 'node-1',
  parentNodeId: null,
  priority: null,
  desiredRetention: null,
  reveal: null,
  review: null,
  title: 'Marked note',
  updatedAt: '2026-03-25T09:00:00.000Z'
};

it('renders imported multiline markdown highlight labels without dangling strong markers', () => {
  const content = '**链接： 解压密码： acgbns.com\n\n然后ctrl+v粘贴密码，手输密码易出错 **';
  const parent: Node = {
    ...BASE_NODE,
    id: 'node-parent',
    content
  };
  const highlight: Node = {
    ...BASE_NODE,
    id: 'node-highlight',
    parentNodeId: 'node-parent',
    content: '**链接： 解压密码： acgbns.com',
    title: '**链接：',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 0,
        originalText: content,
        to: content.length
      }
    }
  };

  render(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-parent"
      nodeOrder={['node-parent', 'node-highlight']}
      trashedNodeIds={[]}
      nodesById={{ 'node-parent': parent, 'node-highlight': highlight }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(
    screen.getByRole('button', { name: '链接： 解压密码： acgbns.com 然后ctrl+v粘贴密码，手输密码易出错' })
  ).toBeInTheDocument();
  expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
});
