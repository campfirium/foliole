import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RecentArticleList } from './CompanionRecentArticleList';

describe('RecentArticleList', () => {
  it('clamps article previews to three lines', () => {
    render(
      <RecentArticleList
        currentArticleId={null}
        onSelectArticle={vi.fn()}
        recentArticles={[
          {
            nodeId: 'article-1',
            preview: 'Line one. Line two. Line three. Line four.',
            title: 'Article 1',
            updatedAt: '2026-04-21T10:00:00.000Z'
          }
        ]}
      />
    );

    expect(screen.getByText('Line one. Line two. Line three. Line four.').className).toContain('line-clamp-3');
  });

  it('offers sync from the empty recent topics state when paired', () => {
    const onSyncNow = vi.fn();

    render(
      <RecentArticleList
        currentArticleId={null}
        endpointUrl="http://10.0.2.2:38641"
        onSelectArticle={vi.fn()}
        onSyncNow={onSyncNow}
        recentArticles={[]}
        status="idle"
      />
    );

    expect(screen.getByText('No recent topics have been synced to this device yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(onSyncNow).toHaveBeenCalledWith('http://10.0.2.2:38641');
  });

  it('points to device sync when no desktop endpoint is known', () => {
    render(
      <RecentArticleList
        currentArticleId={null}
        onSelectArticle={vi.fn()}
        recentArticles={[]}
      />
    );

    expect(screen.getByText('Open Device sync to connect this device with desktop.')).toBeInTheDocument();
  });
});
