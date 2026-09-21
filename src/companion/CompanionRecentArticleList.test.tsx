import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CompanionRecentArticle } from '../shared/platform/companionReadableArticle';

import { RecentArticleList, formatCompanionTopicDate, resolveRecentArticlePreviewLineClamp } from './CompanionRecentArticleList';

const article: CompanionRecentArticle = {
  nodeId: 'article-1', title: 'Article 1', preview: 'Opening text',
  folderLabel: 'Inbox', authorLabel: 'Ada', updatedAt: '2026-04-21T10:00:00.000Z'
};
function setup(overrides: Partial<CompanionRecentArticle> = {}) {
  const onSelectArticle = vi.fn();
  render(<RecentArticleList currentArticleId={article.nodeId} onSelectArticle={onSelectArticle} recentArticles={[{ ...article, ...overrides }]} />);
  return onSelectArticle;
}

describe('RecentArticleList', () => {
  it('limits the title to two lines and retains four lines across title and body', () => {
    expect(resolveRecentArticlePreviewLineClamp(1, true)).toBe(3);
    expect(resolveRecentArticlePreviewLineClamp(2, true)).toBe(2);
    expect(resolveRecentArticlePreviewLineClamp(10, true)).toBe(2);
    expect(resolveRecentArticlePreviewLineClamp(1, false)).toBe(0);
  });
  it('shows the folder and local date/time without author or an update label', () => {
    setup();
    const row = screen.getByRole('button', { name: 'Open topic Article 1' });
    expect(row).toHaveTextContent('Inbox');
    expect(row).toHaveTextContent(formatCompanionTopicDate(article.updatedAt, 'en'));
    expect(row).not.toHaveTextContent('Ada');
    expect(row).not.toHaveTextContent('Updated');
    expect(row).toHaveTextContent('Opening text');
  });
  it('opens the selected topic from its text', () => {
    const select = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Open topic Article 1' }));
    expect(select).toHaveBeenCalledWith('article-1');
  });
  it('opens the overflow menu independently without navigating', () => {
    const select = setup();
    fireEvent.click(screen.getByRole('button', { name: 'More: Article 1' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(select).not.toHaveBeenCalled();
  });
  it('omits unavailable metadata without inventing a folder or timestamp', () => {
    setup({ folderLabel: null, updatedAt: '' });
    expect(screen.getByRole('button', { name: 'Open topic Article 1' })).not.toHaveTextContent('Inbox');
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
  });
  it('retains content availability feedback', () => {
    setup({ bodyStatus: 'failed' });
    expect(screen.getByRole('button', { name: 'Open topic Article 1' })).toHaveTextContent('Topic body unavailable');
  });
  it('marks empty content', () => {
    setup({ bodyStatus: 'empty', preview: null });
    expect(screen.getByRole('button', { name: 'Open topic Article 1' })).toHaveTextContent('Empty topic');
  });
  it('does not show download noise for missing content', () => {
    setup({ bodyStatus: 'missing' });
    expect(screen.queryByText('Content syncing')).not.toBeInTheDocument();
  });
  it('keeps the empty state passive', () => {
    render(<RecentArticleList currentArticleId={null} onSelectArticle={vi.fn()} recentArticles={[]} />);
    expect(screen.getByText('No recent topics are available on this device yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });
});
