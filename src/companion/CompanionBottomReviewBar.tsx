import { useRef } from 'react';

import { isReadActionAdvanceReadyFromMetrics } from '../features/review/model/readActionAdvanceReady';
import { FsrsRevealAction, ReadingReviewActions, ReviewGradeActions } from '../shared/ui';
import type { ReviewActionButtonPresentation } from '../shared/ui/reviewActionPresentation';

import type { BottomBarGrade } from './CompanionFloatingBars';
import { CompanionReviewActionFooter } from './CompanionReviewActionFooter';
import { CompanionReviewTouchButton } from './CompanionReviewTouchButton';

function renderCompanionAction(props: ReviewActionButtonPresentation) {
  return <CompanionReviewTouchButton {...props} />;
}

function renderRevealAction(props: ReviewActionButtonPresentation) {
  return <CompanionReviewTouchButton {...props} compact />;
}

const actionGroupClassName = 'companion-review-actions w-full';

export function CompanionBottomReviewBar(props: {
  hasAnswer: boolean;
  disabled?: boolean;
  isAnswerRevealed: boolean;
  itemKind: 'fsrs' | 'reading';
  onSoonReviewTopic?: () => void;
  onReadReviewTopic: (atContentEnd: boolean) => void;
  onPostponeReviewTopic: () => void;
  onDismissReviewTopic: () => void;
  onGrade: (grade: BottomBarGrade) => void;
  onRevealAnswer: () => void;
  reviewCardKey: string | null;
  statusLabel?: string | null;
  visible: boolean;
}) {
  const actionsRef = useRef<HTMLDivElement>(null);
  if (!props.visible) {
    return null;
  }
  const canGradeFsrs = props.itemKind === 'fsrs' && props.hasAnswer && props.isAnswerRevealed;

  return (
    <CompanionReviewActionFooter
      actionsRef={actionsRef}
      reviewCardKey={props.reviewCardKey}
      reviewItemKind={props.itemKind}
      statusLabel={props.statusLabel ?? null}
      primary={
        props.itemKind === 'reading' ? (
          <ReadingReviewActions
            renderButton={renderCompanionAction}
            isSubmitting={Boolean(props.disabled)}
            {...(props.onSoonReviewTopic ? { onRevisitReviewTopicSoon: props.onSoonReviewTopic } : {})}
            actionButtonClassName="companion-bottom-action min-w-0 flex-1 px-0"
            groupClassName={actionGroupClassName}
            onReadReviewTopic={() => props.onReadReviewTopic(isFlowArticleEndVisible(actionsRef.current, props.reviewCardKey))}
            onPostponeReviewTopic={props.onPostponeReviewTopic}
            onDismissReviewTopic={props.onDismissReviewTopic}
          />
        ) : !canGradeFsrs ? (
          <FsrsRevealAction renderButton={renderRevealAction} disabled={!props.hasAnswer || Boolean(props.disabled)} onRevealAnswer={props.onRevealAnswer} />
        ) : (
          <ReviewGradeActions
            buttonClassName="companion-bottom-action min-w-0 flex-1 px-0"
            renderButton={renderCompanionAction}
            buttonVariant="default"
            errorMessage={null}
            groupClassName={actionGroupClassName}
            isSubmitting={Boolean(props.disabled)}
            submitGrade={async (grade) => props.onGrade(grade as BottomBarGrade)}
          />
        )
      }
    />
  );
}

function isFlowArticleEndVisible(actions: HTMLElement | null, nodeId: string | null) {
  const surface = actions?.closest<HTMLElement>('[data-companion-reading-surface]');
  const article = surface?.querySelector<HTMLElement>('[data-companion-article-document]');
  if (!surface?.clientHeight || !article?.scrollHeight || article.dataset.nodeId !== nodeId) return false;
  const viewportTop = surface.getBoundingClientRect().top + surface.clientTop;
  return isReadActionAdvanceReadyFromMetrics({
    clientHeight: surface.clientHeight,
    scrollTop: 0,
    // In Flow the editor can overflow the article box and scroll on the outer surface.
    scrollHeight: article.getBoundingClientRect().top + article.clientTop + article.scrollHeight - viewportTop
  });
}
