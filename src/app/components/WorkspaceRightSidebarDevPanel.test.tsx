import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { inspectorListInsetClassName } from '../../shared/ui';

import { WorkspaceRightSidebarDevPanel } from './WorkspaceRightSidebarDevPanel';

function createTopicNode(overrides: Partial<Node> = {}): Node {
  return {
    content: '',
    createdAt: '2026-05-29T00:39:18.481Z',
    id: 'topic-1',
    kind: 'topic',
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: 'Topic',
    updatedAt: '2026-05-29T00:39:18.481Z',
    ...overrides
  };
}

it('keeps scheduling header, dividers, and rows on the same right panel inset', () => {
  renderWithLocalization(
    <WorkspaceRightSidebarDevPanel
      activeNodeId="topic-1"
      nodesById={{ 'topic-1': createTopicNode() }}
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
    />
  );

  const header = screen.getByRole('heading', { level: 3, name: 'Scheduling' }).closest('section');
  const scheduleHeading = screen.getByRole('heading', { level: 3, name: 'Schedule' });
  const scheduleSection = scheduleHeading.closest('section');
  const scheduleRows = screen.getByText('Next scheduled').closest('dl');

  expect(header).toHaveClass(inspectorListInsetClassName);
  expect(scheduleSection).toHaveClass(inspectorListInsetClassName);
  expect(scheduleSection).not.toHaveClass('mx-1');
  expect(scheduleHeading.className).not.toContain('px-');
  expect(scheduleRows).toHaveClass('px-0');
});
