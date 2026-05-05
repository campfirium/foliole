import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { DocumentPanelNodeReviewSettings } from '../app/components/DocumentPanelNodeReviewSettings';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../features/settings/model/reviewSchedulerSettings';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('shows default desired retention and priority fallbacks on nodes without overrides', () => {
  render(<App />);

  expect(screen.getByLabelText('Inspector')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Dev panel' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Scheduling')).toBeInTheDocument();
  expect(screen.getByText('90.0% · Default')).toBeInTheDocument();
  expect(screen.getByText('P5 · Default')).toBeInTheDocument();
});

it('shows inherited values, writes explicit overrides, and falls back to ancestor values again', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'child-node',
    nodeOrder: ['root-node', 'child-node'],
    nodesById: {
      ...state.nodesById,
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
    }
  }));

  render(<App />);

  expect(screen.getByText('84.0% · Inherited')).toBeInTheDocument();
  expect(screen.getByText('P2 · Inherited')).toBeInTheDocument();
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
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
    />
  );

  expect(screen.getByText('Default · P5 from push queue fallback')).toBeInTheDocument();

  rerender(
    <DocumentPanelNodeReviewSettings
      activeNodeId="root-node"
      editableNodeId="root-node"
      nodesById={nodesById}
      onDesiredRetentionChange={() => undefined}
      onPriorityChange={() => undefined}
      reviewSchedulerSettings={{
        ...DEFAULT_REVIEW_SCHEDULER_SETTINGS,
        pushQueue: {
          ...DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue,
          defaultPriority: 3
        }
      }}
    />
  );

  expect(screen.getByText('Default · P3 from push queue fallback')).toBeInTheDocument();
});
