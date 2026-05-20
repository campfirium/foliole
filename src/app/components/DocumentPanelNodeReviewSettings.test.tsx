import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';

import { DocumentPanelNodeReviewSettings } from './DocumentPanelNodeReviewSettings';

it('renders node review settings inside the shared inspector section', () => {
  const onDesiredRetentionChange = vi.fn();
  const onPriorityChange = vi.fn();
  const onShortTermChange = vi.fn();

  render(
    <DocumentPanelNodeReviewSettings
      activeNodeId="node-1"
      editableNodeId="node-1"
      nodesById={{
        'node-1': {
          kind: 'topic',
          content: 'Body',
          createdAt: '2026-01-01T00:00:00.000Z',
          desiredRetention: null,
          id: 'node-1',
          parentNodeId: null,
          priority: null,
          reveal: null,
          review: null,
          title: 'Node 1',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      }}
      onDesiredRetentionChange={onDesiredRetentionChange}
      onPriorityChange={onPriorityChange}
      onShortTermChange={onShortTermChange}
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
    />
  );

  expect(screen.getByRole('heading', { level: 3, name: 'Review options' })).toBeInTheDocument();
  expect(screen.getByText(/memory target/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Review desired retention'), { target: { value: '0.85' } });
  fireEvent.change(screen.getByLabelText('Review queue priority'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Short-term learning steps'), { target: { value: 'enabled' } });

  expect(onDesiredRetentionChange).toHaveBeenCalledWith('node-1', 0.85);
  expect(onPriorityChange).toHaveBeenCalledWith('node-1', 3);
  expect(onShortTermChange).toHaveBeenCalledWith('node-1', true);
});
