import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  RecentArticleList,
  resolveRecentArticlePreviewLineClamp
} from './CompanionRecentArticleList';

function testResolvesPreviewLineBudget() {
  expect(resolveRecentArticlePreviewLineClamp(1, true)).toBe(3);
  expect(resolveRecentArticlePreviewLineClamp(2, true)).toBe(2);
  expect(resolveRecentArticlePreviewLineClamp(3, true)).toBe(1);
  expect(resolveRecentArticlePreviewLineClamp(4, true)).toBe(0);
  expect(resolveRecentArticlePreviewLineClamp(1, false)).toBe(0);
}

function testUsesFourLineTitleBudgetByDefault() {
  render(
    <RecentArticleList
      currentArticleId={null}
      onSelectArticle={vi.fn()}
      recentArticles={[{
        nodeId: 'article-1',
        preview: 'Line one. Line two. Line three. Line four.',
        title: 'Article 1',
        updatedAt: '2026-04-21T10:00:00.000Z'
      }]}
    />
  );

  expect(screen.getByText('Article 1')).toHaveClass('line-clamp-4');
  expect(screen.getByText('Line one. Line two. Line three. Line four.').className).toContain('line-clamp-3');
  expect(screen.getByText('Line one. Line two. Line three. Line four.').className).not.toContain('line-clamp-2');
}

function testRendersRecentTopicRowsWithFolderMeta() {
  render(
    <RecentArticleList
      currentArticleId={null}
      onSelectArticle={vi.fn()}
      recentArticles={[{
        authorLabel: 'Ada',
        folderLabel: 'Inbox',
        nodeId: 'article-1',
        preview: 'Opening text',
        title: 'Article 1',
        updatedAt: '2026-04-21T10:00:00.000Z'
      }, {
        authorLabel: 'Grace',
        folderLabel: 'Readwise',
        nodeId: 'article-2',
        preview: 'Second opening text',
        title: 'Article 2',
        updatedAt: '2026-04-22T10:00:00.000Z'
      }]}
    />
  );

  expect(screen.queryByText('Continue reading')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open topic Article 1' })).not.toHaveClass('border-l-[3px]');
  expect(screen.getByRole('button', { name: 'Open topic Article 1' })).not.toHaveClass('-mx-6');
  expect(screen.getByRole('button', { name: 'Open topic Article 1' })).not.toHaveClass('px-1');
  expect(screen.getByText('Article 1')).toHaveClass('line-clamp-4');
  expect(screen.getByRole('button', { name: 'Open topic Article 1' })).not.toHaveTextContent('Apr 21');
  expect(screen.getByRole('button', { name: 'Open topic Article 2' })).not.toHaveTextContent('Apr 22');
  expect(screen.getByRole('button', { name: 'Open topic Article 1' })).toHaveTextContent('Inbox · Ada');
  expect(screen.getByRole('button', { name: 'Open topic Article 2' })).toHaveTextContent('Readwise · Grace');
  expect(screen.getByRole('button', { name: 'Open topic Article 1' })).not.toHaveTextContent('min');
  expect(screen.getByText('Article 2')).toHaveClass('line-clamp-4');
  expect(screen.getByRole('button', { name: 'Open topic Article 2' })).toHaveTextContent('Second opening text');
}

function testReservesEmptyMetaLine() {
  const { container } = render(
    <RecentArticleList
      currentArticleId={null}
      onSelectArticle={vi.fn()}
      recentArticles={[{
        nodeId: 'article-1',
        preview: 'Opening text',
        title: 'Article 1',
        updatedAt: '2026-04-21T10:00:00.000Z'
      }]}
    />
  );

  expect(container.querySelector('.min-h-4')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open topic Article 1' })).not.toHaveTextContent('min');
}

function testKeepsCachingTopicsQuiet() {
  render(
    <RecentArticleList
      currentArticleId={null}
      onSelectArticle={vi.fn()}
      recentArticles={[{
        bodyStatus: 'missing',
        nodeId: 'article-1',
        preview: 'Opening text',
        title: 'Article 1',
        updatedAt: '2026-04-21T10:00:00.000Z'
      }]}
    />
  );

  expect(screen.queryByText('Content syncing')).not.toBeInTheDocument();
  expect(screen.getByText('Opening text')).toBeInTheDocument();
}

function testMarksEmptyTopic() {
  render(
    <RecentArticleList
      currentArticleId={null}
      onSelectArticle={vi.fn()}
      recentArticles={[{
        bodyStatus: 'empty',
        nodeId: 'article-1',
        preview: null,
        title: 'Article 1',
        updatedAt: '2026-04-21T10:00:00.000Z'
      }]}
    />
  );

  expect(screen.getByRole('button', { name: 'Open topic Article 1' })).toHaveTextContent('Empty topic');
}

function testMarksUnavailableTopicBody() {
  render(
    <RecentArticleList
      currentArticleId={null}
      onSelectArticle={vi.fn()}
      recentArticles={[{
        bodyStatus: 'failed',
        authorLabel: 'Ada',
        folderLabel: 'Inbox',
        nodeId: 'article-1',
        preview: 'Opening text',
        title: 'Article 1',
        updatedAt: '2026-04-21T10:00:00.000Z'
      }]}
    />
  );

  expect(screen.getByRole('button', { name: 'Open topic Article 1' })).toHaveTextContent('Inbox · Ada · Topic body unavailable');
}

function testKeepsEmptyRecentTopicsPassive() {
  render(
    <RecentArticleList
      currentArticleId={null}
      onSelectArticle={vi.fn()}
      recentArticles={[]}
    />
  );

  expect(screen.getByText('No recent topics are available on this device yet.')).toBeInTheDocument();
  expect(screen.getByText('Recent topics will appear here after background sync downloads them.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
}

describe('RecentArticleList', () => {
  it('resolves the preview line budget from measured title lines', testResolvesPreviewLineBudget);
  it('uses the four-line title and preview budget by default', testUsesFourLineTitleBudgetByDefault);
  it('renders recent topics as uniform rows with folder metadata', testRendersRecentTopicRowsWithFolderMeta);
  it('reserves the metadata line even when no metadata is available', testReservesEmptyMetaLine);
  it('keeps recent topics quiet while their bodies are still downloading', testKeepsCachingTopicsQuiet);
  it('marks recent topics whose content is empty', testMarksEmptyTopic);
  it('marks recent topics whose body is unavailable', testMarksUnavailableTopicBody);
  it('keeps the empty recent topics state passive while automatic sync owns refresh', testKeepsEmptyRecentTopicsPassive);
});
