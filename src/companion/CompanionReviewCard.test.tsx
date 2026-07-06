import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionReviewAnswer, CompanionReviewCard } from './CompanionReviewCard';

vi.mock('./CompanionArticleDocument', () => ({
  CompanionArticleDocument: ({
    content,
    hideTitleHeading,
    layout,
    nodeId
  }: {
    content: string;
    hideTitleHeading?: boolean;
    layout?: 'article' | 'review';
    nodeId: string;
  }) => (
    <div
      data-hide-title-heading={hideTitleHeading ? 'true' : 'false'}
      data-layout={layout ?? 'article'}
      data-node-id={nodeId}
    >
      {content}
    </div>
  )
}));

function createCard() {
  return {
    content: 'Readable topic body',
    due: '2026-04-22T08:00:00.000Z',
    hasAnswer: true,
    hideTitleHeading: true,
    itemKind: 'reading' as const,
    nodeId: 'topic-1',
    queuePosition: 1,
    remainingCount: 1,
    reveal: 'Answer body',
    title: 'Readable article',
    totalCount: 1
  };
}

describe('CompanionReviewCard', () => {
  it('renders only the reading body for review content', () => {
    renderWithLocalization(
      <CompanionReviewCard
        breadcrumbItems={[
          { id: 'folder-1', label: 'Projects', targetNodeId: 'folder-1' },
          { id: 'folder-2', label: 'Reading', targetNodeId: 'folder-2' },
          { id: 'topic-1', isCurrent: true, label: 'Article title', targetNodeId: 'topic-1' }
        ]}
        card={createCard()}
      />
    );

    expect(screen.getByText('Readable topic body')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getAllByText('Article title')).toHaveLength(2);
    expect(screen.queryByText('Prompt')).not.toBeInTheDocument();
    expect(screen.queryByText('Readable article')).not.toBeInTheDocument();
    expect(screen.queryByText('Due now')).not.toBeInTheDocument();
    expect(screen.getByText('Readable topic body')).toHaveAttribute(
      'data-hide-title-heading',
      'true'
    );
    expect(screen.getByText('Readable topic body')).toHaveAttribute('data-layout', 'review');
  });

  it('renders an unavailable answer state when the answer body is not synced', () => {
    renderWithLocalization(<CompanionReviewAnswer card={{ ...createCard(), reveal: null }} />);

    expect(screen.getByText('Answer not synced to this device yet.')).toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('renders the answer section only when reveal content exists', () => {
    renderWithLocalization(<CompanionReviewAnswer card={createCard()} />);

    expect(screen.getByText('Answer')).toBeInTheDocument();
    expect(screen.getByRole('separator')).not.toHaveClass('mx-5');
    expect(screen.getByRole('separator')).not.toHaveClass('mx-6');
    expect(screen.getByText('Answer body')).toBeInTheDocument();
    expect(screen.getByText('Answer body')).toHaveAttribute('data-layout', 'review');
  });
});
