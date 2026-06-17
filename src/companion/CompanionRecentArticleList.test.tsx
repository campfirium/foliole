import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RecentArticleList } from './CompanionRecentArticleList';

function testClampsArticlePreviews() {
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

  expect(screen.getByText('Line one. Line two. Line three. Line four.').className).toContain('line-clamp-2');
}

function testRendersContinueReadingEntry() {
  render(
    <RecentArticleList
      currentArticleId={null}
      onSelectArticle={vi.fn()}
      recentArticles={[{
        nodeId: 'article-1',
        preview: 'Opening text',
        title: 'Article 1',
        updatedAt: '2026-04-21T10:00:00.000Z'
      }, {
        nodeId: 'article-2',
        preview: 'Second opening text',
        title: 'Article 2',
        updatedAt: '2026-04-22T10:00:00.000Z'
      }]}
    />
  );

  expect(screen.getByText('Continue reading')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open topic Article 1' })).toHaveClass('border-l-[3px]');
  expect(screen.getByRole('button', { name: 'Open topic Article 2' })).toHaveTextContent('Second opening text');
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

  expect(screen.getByText('Empty topic')).toBeInTheDocument();
}

function testMarksUnavailableTopicBody() {
  render(
    <RecentArticleList
      currentArticleId={null}
      onSelectArticle={vi.fn()}
      recentArticles={[{
        bodyStatus: 'failed',
        nodeId: 'article-1',
        preview: 'Opening text',
        title: 'Article 1',
        updatedAt: '2026-04-21T10:00:00.000Z'
      }]}
    />
  );

  expect(screen.getByText('Topic body unavailable')).toBeInTheDocument();
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
  it('clamps article previews to two lines', testClampsArticlePreviews);
  it('renders the first recent topic as a continue reading entry', testRendersContinueReadingEntry);
  it('keeps recent topics quiet while their bodies are still downloading', testKeepsCachingTopicsQuiet);
  it('marks recent topics whose content is empty', testMarksEmptyTopic);
  it('marks recent topics whose body is unavailable', testMarksUnavailableTopicBody);
  it('keeps the empty recent topics state passive while automatic sync owns refresh', testKeepsEmptyRecentTopicsPassive);
});
