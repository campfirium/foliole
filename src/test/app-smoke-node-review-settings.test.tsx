import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { DocumentPanelNodeReviewSettings } from '../app/components/DocumentPanelNodeReviewSettings';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../features/settings/model/reviewSchedulerSettings';

import { createNode } from './app-smoke.shared';

it('shows default desired retention and priority fallbacks on nodes without overrides', () => {
  const nodesById = {
    'root-node': createNode({
      id: 'root-node',
      title: 'Root node',
      content: '# Root'
    })
  };

  render(
    <DocumentPanelNodeReviewSettings
      activeNodeId="root-node"
      editableNodeId="root-node"
      nodesById={nodesById}
      onDesiredRetentionChange={() => undefined}
      onPriorityChange={() => undefined}
      onShortTermChange={() => undefined}
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
    />
  );

  expect(screen.getByText('Using review settings: 0.90')).toBeInTheDocument();
  expect(screen.getByText('Using queue fallback: P5')).toBeInTheDocument();
});

it('shows inherited values, writes explicit overrides, and falls back to ancestor values again', () => {
  const nodesById = {
    'root-node': createNode({
      id: 'root-node',
      title: 'Root node',
      content: '# Root',
      priority: 2,
      desiredRetention: 0.84
    }),
    'child-node': createNode({
      id: 'child-node',
      parentNodeId: 'root-node',
      title: 'Child node',
      content: 'Child content'
    })
  };

  render(
    <DocumentPanelNodeReviewSettings
      activeNodeId="child-node"
      editableNodeId="child-node"
      nodesById={nodesById}
      onDesiredRetentionChange={() => undefined}
      onPriorityChange={() => undefined}
      onShortTermChange={() => undefined}
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
    />
  );

  expect(screen.getByText('Inherited · 0.84 from Root node')).toBeInTheDocument();
  expect(screen.getByText('Inherited · P2 from Root node')).toBeInTheDocument();
});

it('updates the default priority copy when the global fallback changes', () => {
  const nodesById = {
    'root-node': createNode({
      id: 'root-node',
      title: 'Root node',
      content: '# Root'
    })
  };

  const { rerender } = render(
    <DocumentPanelNodeReviewSettings
      activeNodeId="root-node"
      editableNodeId="root-node"
      nodesById={nodesById}
      onDesiredRetentionChange={() => undefined}
      onPriorityChange={() => undefined}
      onShortTermChange={() => undefined}
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
    />
  );

  expect(screen.getByText('Using queue fallback: P5')).toBeInTheDocument();

  rerender(
    <DocumentPanelNodeReviewSettings
      activeNodeId="root-node"
      editableNodeId="root-node"
      nodesById={nodesById}
      onDesiredRetentionChange={() => undefined}
      onPriorityChange={() => undefined}
      onShortTermChange={() => undefined}
      reviewSchedulerSettings={{
        ...DEFAULT_REVIEW_SCHEDULER_SETTINGS,
        pushQueue: {
          ...DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue,
          defaultPriority: 3
        }
      }}
    />
  );

  expect(screen.getByText('Using queue fallback: P3')).toBeInTheDocument();
});
