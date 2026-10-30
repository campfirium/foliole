import { Eye } from 'lucide-react';

import { FsrsRevealAction, ReadingReviewActions, ReviewGradeActions } from '../shared/ui';
import type { ReviewActionButtonPresentation } from '../shared/ui/reviewActionPresentation';

import { CompanionBottomAction } from './CompanionBottomAction';
import type { BottomBarGrade } from './CompanionFloatingBars';
import { CompanionReviewActionFooter } from './CompanionReviewActionFooter';
import { companionGradeIcons, companionReadingIcons } from './CompanionReviewActionIcons';

function renderCompanionAction(props: ReviewActionButtonPresentation) {
  return <CompanionBottomAction {...props} icon={props.icon ?? <Eye aria-hidden="true" size={20} strokeWidth={1.75} />} />;
}

const actionGroupClassName = 'companion-review-actions w-full';

export function CompanionBottomReviewBar(props: {
  hasAnswer: boolean;
  disabled?: boolean;
  isAnswerRevealed: boolean;
  itemKind: 'fsrs' | 'reading';
  onSoonReviewTopic?: () => void;
  onReadReviewTopic: () => void;
  onPostponeReviewTopic: () => void;
  onDismissReviewTopic: () => void;
  onGrade: (grade: BottomBarGrade) => void;
  onRevealAnswer: () => void;
  reviewCardKey: string | null;
  statusLabel?: string | null;
  visible: boolean;
}) {
  if (!props.visible) {
    return null;
  }
  const canGradeFsrs = props.itemKind === 'fsrs' && props.hasAnswer && props.isAnswerRevealed;

  return (
    <CompanionReviewActionFooter
      reviewCardKey={props.reviewCardKey}
      reviewItemKind={props.itemKind}
      statusLabel={props.statusLabel ?? null}
      primary={
        props.itemKind === 'reading' ? (
          <ReadingReviewActions
            icons={companionReadingIcons}
            renderButton={renderCompanionAction}
            isSubmitting={Boolean(props.disabled)}
            {...(props.onSoonReviewTopic ? { onRevisitReviewTopicSoon: props.onSoonReviewTopic } : {})}
            actionButtonClassName="companion-bottom-action min-w-0 flex-1 px-0"
            groupClassName={actionGroupClassName}
            onReadReviewTopic={props.onReadReviewTopic}
            onPostponeReviewTopic={props.onPostponeReviewTopic}
            onDismissReviewTopic={props.onDismissReviewTopic}
          />
        ) : !canGradeFsrs ? (
          <FsrsRevealAction renderButton={renderCompanionAction} disabled={!props.hasAnswer || Boolean(props.disabled)} onRevealAnswer={props.onRevealAnswer} />
        ) : (
          <ReviewGradeActions
            buttonClassName="companion-bottom-action min-w-0 flex-1 px-0"
            icons={companionGradeIcons}
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
