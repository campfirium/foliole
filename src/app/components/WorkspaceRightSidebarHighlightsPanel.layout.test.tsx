import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarHighlightsPanel } from './WorkspaceRightSidebarHighlightsPanel';

const BASE_NODE: Node = {
  kind: 'topic',
  content: '',
  createdAt: '2026-05-13T00:00:00.000Z',
  id: 'node-base',
  parentNodeId: null,
  priority: null,
  desiredRetention: null,
  reveal: null,
  review: null,
  title: 'Topic',
  updatedAt: '2026-05-13T00:00:00.000Z'
};

function createNode(overrides: Partial<Node>): Node {
  return {
    ...BASE_NODE,
    ...overrides
  };
}

it('allows long markdown link tokens to wrap inside the highlights sidebar', () => {
  const longHighlightText = [
    'KS的日语学习工具',
    '[Bug feedback](https://github.com/ks233/ja-learner/issues/1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ)',
    '(asset://d2a406330ce7085c50ba8556397471c325)'
  ].join(' ');
  const parentNode = createNode({
    content: longHighlightText,
    id: 'node-parent'
  });
  const highlightNode = createNode({
    anchorLink: {
      id: 'anchor-highlight',
      kind: 'highlight',
      locator: {
        from: 0,
        originalText: longHighlightText,
        to: longHighlightText.length
      }
    },
    content: longHighlightText,
    id: 'node-highlight',
    parentNodeId: 'node-parent'
  });

  renderWithLocalization(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-parent"
      nodeOrder={['node-parent', 'node-highlight']}
      nodesById={{
        'node-parent': parentNode,
        'node-highlight': highlightNode
      }}
      onRevealHighlight={() => undefined}
      trashedNodeIds={[]}
    />
  );

  const text = screen.getByText((content) => content.includes('Bug feedback'));
  expect(text).toHaveClass('min-w-0', 'max-w-full', 'whitespace-normal', 'break-words');
  expect(screen.getByRole('button', { name: /Bug feedback/i })).toHaveClass('min-w-0');
  expect(screen.queryByText(/github\.com\/ks233\/ja-learner\/issues/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/asset:\/\//i)).not.toBeInTheDocument();
  expect(screen.getByText('HIGHLIGHTS(1)')).toBeInTheDocument();
});

it('keeps highlight summaries stable when child node content changes', () => {
  const stableOriginalText = 'Stable full highlight text from the source topic';
  const parentNode = createNode({
    content: stableOriginalText,
    id: 'node-parent'
  });
  const highlightNode = createNode({
    anchorLink: {
      id: 'anchor-highlight',
      kind: 'highlight',
      locator: {
        from: 0,
        originalText: stableOriginalText,
        to: stableOriginalText.length
      }
    },
    content: 'Short child content',
    id: 'node-highlight',
    parentNodeId: 'node-parent'
  });
  const { rerender } = renderWithLocalization(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-parent"
      nodeOrder={['node-parent', 'node-highlight']}
      nodesById={{
        'node-parent': parentNode,
        'node-highlight': highlightNode
      }}
      onRevealHighlight={() => undefined}
      trashedNodeIds={[]}
    />
  );

  expect(screen.getByRole('button', { name: stableOriginalText })).toBeInTheDocument();

  rerender(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-parent"
      nodeOrder={['node-parent', 'node-highlight']}
      nodesById={{
        'node-parent': parentNode,
        'node-highlight': {
          ...highlightNode,
          content: `${stableOriginalText} plus an edited child note`
        }
      }}
      onRevealHighlight={() => undefined}
      trashedNodeIds={[]}
    />
  );

  expect(screen.getByRole('button', { name: stableOriginalText })).toBeInTheDocument();
  expect(screen.queryByText(/edited child note/)).not.toBeInTheDocument();
});

it('projects markdown syntax out of highlight summaries', () => {
  const originalText = [
    '### 功能介绍',
    '**语句分析**：用不同样式区分句子成分',
    '[下载](https://github.com/ks233/ja-learner/releases)',
    '#添加 Anki 卡片#'
  ].join('\n');
  const parentNode = createNode({
    content: originalText,
    id: 'node-parent'
  });
  const highlightNode = createNode({
    anchorLink: {
      id: 'anchor-highlight',
      kind: 'highlight',
      locator: {
        from: 0,
        originalText,
        to: originalText.length
      }
    },
    content: originalText,
    id: 'node-highlight',
    parentNodeId: 'node-parent'
  });

  renderWithLocalization(
    <WorkspaceRightSidebarHighlightsPanel
      activeNodeId="node-parent"
      nodeOrder={['node-parent', 'node-highlight']}
      nodesById={{
        'node-parent': parentNode,
        'node-highlight': highlightNode
      }}
      onRevealHighlight={() => undefined}
      trashedNodeIds={[]}
    />
  );

  expect(screen.getByRole('button', {
    name: '功能介绍 语句分析：用不同样式区分句子成分 下载 添加 Anki 卡片'
  })).toBeInTheDocument();
});
