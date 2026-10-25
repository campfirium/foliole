import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { ReviewBreadcrumb } from './CompanionReviewBreadcrumb';
import { buildReviewBreadcrumbItems } from './companionReviewBreadcrumbs';
import { createBreadcrumbSnapshot } from './CompanionShellBreadcrumbTestSupport';

it('conceals the immediate item parent behind a clickable ellipsis and limits other labels to four characters', () => {
  const snapshot = createBreadcrumbSnapshot();
  const items = buildReviewBreadcrumbItems(snapshot, 'item-1');
  const select = vi.fn();
  renderWithLocalization(<ReviewBreadcrumb items={items} onSelectItem={select} />);
  expect(screen.queryByText('Inner review topic')).not.toBeInTheDocument();
  expect(screen.queryByTitle('Inner review topic')).not.toBeInTheDocument();
  expect(items.map(item => item.label)).toEqual(['Inbo', 'Topi', '...']);
  fireEvent.click(screen.getByRole('button', { name: '...' }));
  expect(select).toHaveBeenCalledWith('topic-2');
});

it('uses a single short English word or up to four Unicode characters for earlier ancestors', () => {
  const snapshot = createBreadcrumbSnapshot();
  const folder = snapshot.nodesById['folder-1'];
  const topic = snapshot.nodesById['topic-1'];
  if (!folder || !topic) throw new Error('Missing breadcrumb fixture');
  folder.title = 'My articles';
  topic.title = '阅读资料标题';
  expect(buildReviewBreadcrumbItems(snapshot, 'item-1').map(item => item.label)).toEqual(['My', '阅读资料', '...']);
});
