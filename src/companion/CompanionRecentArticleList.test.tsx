import { render, screen } from '@testing-library/react';
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
});
