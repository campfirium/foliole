import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

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

  renderWithLocalization(
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

it('renders markdown escaped punctuation as readable sidebar text', () => {
  const content = 'MVP 不是把一个小功能直接丢给用户，而是做一个最小\\_实验\\_来验证我们\\_要给\\_用户做的功能。';
  const parent: Node = {
    ...BASE_NODE,
    id: 'node-parent',
    content
  };
  const highlight: Node = {
    ...BASE_NODE,
    id: 'node-highlight',
    parentNodeId: 'node-parent',
    content,
    title: content,
    anchorLink: {
      id: 'hl-escaped',
      kind: 'highlight',
      locator: {
        from: 0,
        originalText: content,
        to: content.length
      }
    }
  };

  renderWithLocalization(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-parent"
      nodeOrder={['node-parent', 'node-highlight']}
      trashedNodeIds={[]}
      nodesById={{ 'node-parent': parent, 'node-highlight': highlight }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(screen.getByRole('button')).toHaveTextContent(
    'MVP 不是把一个小功能直接丢给用户，而是做一个最小_实验_来验证我们_要给_用户做的功能。'
  );
  expect(screen.queryByText(/\\/)).not.toBeInTheDocument();
});

it('renders empty-alt image highlight labels without exposing the asset URL', () => {
  const content = '![](asset://7aeed822aea5916460d95e2220aeeeacaf3f31244115095762db670b23cb3fec.jpg)';
  const parent: Node = {
    ...BASE_NODE,
    id: 'node-parent',
    content
  };
  const highlight: Node = {
    ...BASE_NODE,
    id: 'node-highlight',
    parentNodeId: 'node-parent',
    content,
    title: 'Image highlight',
    anchorLink: {
      id: 'hl-image',
      kind: 'highlight',
      locator: {
        from: 0,
        originalText: content,
        to: content.length
      }
    }
  };

  renderWithLocalization(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-parent"
      nodeOrder={['node-parent', 'node-highlight']}
      trashedNodeIds={[]}
      nodesById={{ 'node-parent': parent, 'node-highlight': highlight }}
      onRevealHighlight={() => undefined}
    />
  );

  expect(screen.getByRole('button', { name: 'Image highlight' })).toBeInTheDocument();
  expect(screen.queryByText(/asset:\/\//)).not.toBeInTheDocument();
});
