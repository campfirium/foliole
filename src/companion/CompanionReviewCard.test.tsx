import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionReviewAnswer, CompanionReviewCard } from './CompanionReviewCard';

vi.mock('./CompanionArticleDocument', () => ({
  CompanionArticleDocument: ({
    content,
    hideTitleHeading,
    nodeId
  }: {
    content: string;
    hideTitleHeading?: boolean;
    nodeId: string;
  }) => (
    <div data-hide-title-heading={hideTitleHeading ? 'true' : 'false'} data-node-id={nodeId}>
      {content}
    </div>
  )
}));

function createCard() {
  return {
    content: 'Readable topic body',
    due: '2026-04-22T08:00:00.000Z',
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
    render(
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
    expect(screen.getByText('Article title')).toBeInTheDocument();
    expect(screen.queryByText('Prompt')).not.toBeInTheDocument();
    expect(screen.queryByText('Readable article')).not.toBeInTheDocument();
    expect(screen.queryByText('Due now')).not.toBeInTheDocument();
    expect(screen.getByText('Readable topic body')).toHaveAttribute('data-hide-title-heading', 'true');
  });

  it('renders the answer section only when reveal content exists', () => {
    render(<CompanionReviewAnswer card={createCard()} />);

    expect(screen.getByText('Answer')).toBeInTheDocument();
    expect(screen.getByText('Answer body')).toBeInTheDocument();
  });
});
