import { fireEvent, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { createBreadcrumbSnapshot, createItemReviewSurface } from './CompanionShellBreadcrumbTestSupport';
import { CompanionShellReadableArticle } from './CompanionShellReadableArticle';

vi.mock('@/features/editor/components/MarkdownEditor', () => ({
  MarkdownEditor: (props: { value: string }) => <article>{props.value}</article>
}));

type Props = ComponentProps<typeof CompanionShellReadableArticle>;

function renderFlow(bodyStatus: 'empty' | 'missing', isAnswerRevealed: boolean) {
  const snapshot = createBreadcrumbSnapshot();
  const node = snapshot.nodesById['item-1']!;
  const base = createItemReviewSurface();
  const surface = { ...base, isAnswerRevealed, handleRevealAnswer: vi.fn(), handleGradeReview: vi.fn(),
    readableArticle: { bodyStatus, content: '', nodeId: node.id, title: node.title, textAnchorDecorations: [] },
    effectiveReviewSession: { ...base.effectiveReviewSession,
      currentCard: { ...base.effectiveReviewSession.currentCard, nodeId: node.id, content: '', reveal: null,
        hasAnswer: false, itemKind: 'fsrs' } } };
  renderWithLocalization(<CompanionShellReadableArticle flow onExit={vi.fn()}
    surface={surface as unknown as Props['surface']}
    workspaceSync={{ state: { workspace_snapshot: snapshot, remembered_targets: [] }, refreshAfterMutation: vi.fn() } as unknown as Props['workspaceSync']} />);
  return surface;
}

it('can reveal an Item that has no answer yet', () => {
  const surface = renderFlow('empty', false);
  fireEvent.click(screen.getByLabelText('Show Answer'));
  expect(surface.handleRevealAnswer).toHaveBeenCalled();
});

it('can grade a revealed Item that has no answer yet', () => {
  renderFlow('empty', true);
  expect(screen.getByLabelText('Again')).toBeEnabled();
});

it('waits for a body that has not reached this device', () => {
  renderFlow('missing', false);
  expect(screen.getByLabelText('Show Answer')).toBeDisabled();
});
