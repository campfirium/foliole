import { screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';
import { resolveLoadedCompanionArticle } from '../shared/platform/companionReadableArticle';

import { createBreadcrumbSnapshot, createItemReviewSurface } from './CompanionShellBreadcrumbTestSupport';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';

vi.mock('@/features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string }) => <article>{props.value}</article>
}));

type Props = ComponentProps<typeof CompanionShellReadableArticle>;

function createProps(flow: boolean, browsing = false): Props {
  const snapshot = createBreadcrumbSnapshot();
  const node = snapshot.nodesById['item-1']!;
  const article = resolveLoadedCompanionArticle(snapshot, {
    id: node.id, content: node.content, reveal: node.reveal, title: node.title,
    body_blob_hash: null, content_status: 'ready', pdf_attachment_id: null
  });
  node.content = '';
  node.reveal = null;
  const base = createItemReviewSurface();
  const surface = {
    ...base,
    isFlowBrowsing: browsing,
    selectedBrowseNodeId: browsing ? node.id : null,
    readableArticle: article,
    effectiveReviewSession: {
      ...base.effectiveReviewSession,
      currentCard: { ...base.effectiveReviewSession.currentCard, nodeId: node.id,
        content: node.content, reveal: 'Review answer', hasAnswer: true, itemKind: 'fsrs' }
    }
  } as unknown as Props['surface'];
  return {
    flow,
    onExit: vi.fn(),
    surface,
    workspaceSync: {
      state: { workspace_snapshot: snapshot, remembered_targets: [] },
      refreshAfterMutation: vi.fn()
    } as unknown as Props['workspaceSync']
  };
}

describe('Companion Item answer visibility', () => {
  it.each([false, true])('shows the selected Item answer while reading with Flow browsing=%s', browsing => {
    const props = createProps(false, browsing);
    renderWithLocalization(<CompanionShellReadableArticle {...props} />);

    expect(screen.getByText('Prompt body')).toBeInTheDocument();
    expect(screen.getByText('Answer')).toBeInTheDocument();
    expect(screen.queryByText('Review answer')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Show Answer')).not.toBeInTheDocument();
  });

  it('reveals only on request in review and immediately shows the answer after leaving review', () => {
    const props = createProps(true);
    const view = renderWithLocalization(<CompanionShellReadableArticle {...props} />);
    expect(screen.getByText('Prompt body')).toBeInTheDocument();
    expect(screen.queryByText('Review answer')).not.toBeInTheDocument();
    expect(screen.queryByText('Answer')).not.toBeInTheDocument();

    props.surface.isAnswerRevealed = true;
    view.rerender(<CompanionShellReadableArticle {...props} />);
    expect(screen.getByText('Review answer')).toBeInTheDocument();

    props.surface.isAnswerRevealed = false;
    view.rerender(<CompanionShellReadableArticle {...props} flow={false} />);
    expect(screen.getByText('Answer')).toBeInTheDocument();
    expect(screen.queryByText('Review answer')).not.toBeInTheDocument();

    view.rerender(<CompanionShellReadableArticle {...props} />);
    expect(screen.queryByText('Answer')).not.toBeInTheDocument();
    expect(screen.queryByText('Review answer')).not.toBeInTheDocument();
  });
});
