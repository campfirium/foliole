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

it('caps CJK levels by display width and cuts before an early colon', () => {
  const snapshot = createBreadcrumbSnapshot();
  const folder = snapshot.nodesById['folder-1'];
  const topic = snapshot.nodesById['topic-1'];
  if (!folder || !topic) throw new Error('Missing breadcrumb fixture');
  folder.title = '掌控习惯：一个简单可行的自我提升方法';
  topic.title = '第1章 微习惯的惊人力量';
  expect(buildReviewBreadcrumbItems(snapshot, 'item-1').map(item => item.label)).toEqual(['掌控习惯…', '第1章 微习惯…', 'Inner review…']);
});

it('drops Markdown marks and hides a cloze answer in the ancestors behind a single *', () => {
  const snapshot = createBreadcrumbSnapshot();
  const topic = snapshot.nodesById['topic-1'];
  const extract = snapshot.nodesById['topic-2'];
  const item = snapshot.nodesById['item-1'];
  if (!topic || !extract || !item) throw new Error('Missing breadcrumb fixture');
  topic.title = '## **Light** #notes';
  extract.title = '光合作用发生在**叶绿体**中';
  item.content = '光合作用发生在[...]中';
  item.anchorLink = { id: 'anchor-1', kind: 'cloze', locator: { from: 7, originalText: '叶绿体', to: 10 } };
  const items = buildReviewBreadcrumbItems(snapshot, 'item-1');
  expect(items.map(entry => entry.title)).toEqual(['Inbox', 'Light notes', '光合作用发生在*中']);
  expect(items.map(entry => entry.label).join('')).not.toContain('叶绿体');
});
