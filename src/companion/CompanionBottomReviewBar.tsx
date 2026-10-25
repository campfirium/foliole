import { FsrsRevealAction, ReadingReviewActions, ReviewGradeActions } from '../shared/ui';

import { companionFlexRowGap2ClassName } from './companionCssCompatibility';
import type { BottomBarGrade } from './CompanionFloatingBars';
import { CompanionReviewActionFooter } from './CompanionReviewActionFooter';

const actionGroupClassName = `w-full ${companionFlexRowGap2ClassName}`;

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
            isSubmitting={Boolean(props.disabled)}
            {...(props.onSoonReviewTopic ? { onRevisitReviewTopicSoon: props.onSoonReviewTopic } : {})}
            actionButtonClassName="min-w-0 flex-1 border-border px-2"
            groupClassName={actionGroupClassName}
            onReadReviewTopic={props.onReadReviewTopic}
            onPostponeReviewTopic={props.onPostponeReviewTopic}
            onDismissReviewTopic={props.onDismissReviewTopic}
          />
        ) : !canGradeFsrs ? (
          <FsrsRevealAction disabled={!props.hasAnswer || Boolean(props.disabled)} onRevealAnswer={props.onRevealAnswer} />
        ) : (
          <ReviewGradeActions
            buttonClassName="min-w-0 flex-1 px-3"
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
