import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { ReviewBreadcrumb } from './CompanionReviewBreadcrumb';
import { buildReviewBreadcrumbItems } from './companionReviewBreadcrumbs';
import { createBreadcrumbSnapshot } from './CompanionShellBreadcrumbTestSupport';

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists only the ancestors with capped labels, nearest last, each one clickable', () => {
  const items = buildReviewBreadcrumbItems(createBreadcrumbSnapshot(), 'item-1');
  const select = vi.fn();
  renderWithLocalization(<ReviewBreadcrumb items={items} onSelectItem={select} />);
  expect(items.map(item => item.label)).toEqual(['Inbox', 'Topic node…', 'Inner review…']);
  expect(screen.queryByText('Item title')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Expand breadcrumb path' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Inner review…' }));
  expect(select).toHaveBeenCalledWith('topic-2');
});

it('collapses far levels that do not fit into a leading … that lists the full path', () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(250);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.querySelectorAll('button').length * 100;
  });
  const items = buildReviewBreadcrumbItems(createBreadcrumbSnapshot(), 'item-1');
  const select = vi.fn();
  renderWithLocalization(<ReviewBreadcrumb items={items} onSelectItem={select} />);
  expect(screen.queryByRole('button', { name: 'Inbox' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Inner review…' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Expand breadcrumb path' }));
  const sheet = screen.getByRole('dialog');
  expect(within(sheet).getAllByRole('button').map(button => button.textContent).filter(text => text !== 'Close')).toEqual(['Inbox', 'Topic node title', 'Inner review topic']);
  fireEvent.click(within(sheet).getByRole('button', { name: 'Inbox' }));
  expect(select).toHaveBeenCalledWith('folder-1');
});

it('caps CJK levels at six glyphs and cuts before an early colon', () => {
  const snapshot = createBreadcrumbSnapshot();
  const folder = snapshot.nodesById['folder-1'];
  const topic = snapshot.nodesById['topic-1'];
  if (!folder || !topic) throw new Error('Missing breadcrumb fixture');
  folder.title = '掌控习惯：一个简单可行的自我提升方法';
  topic.title = '第1章 微习惯的惊人力量';
  expect(buildReviewBreadcrumbItems(snapshot, 'item-1').map(item => item.label)).toEqual(['掌控习惯…', '第1章 微习…', 'Inner review…']);
});
