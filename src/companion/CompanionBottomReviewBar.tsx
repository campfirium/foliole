import { useTranslation } from '../shared/localization/LocalizationProvider';
import { FsrsRevealAction, ReadingReviewActions, ReviewActionBar, ReviewGradeActions } from '../shared/ui';

import { companionFlexRowGap2ClassName } from './companionCssCompatibility';
import type { BottomBarGrade } from './CompanionFloatingBars';

const actionGroupClassName = `w-full ${companionFlexRowGap2ClassName}`;

export function CompanionBottomReviewBar(props: {
  hasAnswer: boolean;
  disabled?: boolean;
  isAnswerRevealed: boolean;
  itemKind: 'fsrs' | 'reading';
  onReadReviewTopic: () => void;
  onPostponeReviewTopic: () => void;
  onDismissReviewTopic: () => void;
  onGrade: (grade: BottomBarGrade) => void;
  onRevealAnswer: () => void;
  reviewCardKey: string | null;
  statusLabel?: string | null;
  visible: boolean;
}) {
  const t = useTranslation();
  if (!props.visible) {
    return null;
  }
  const canGradeFsrs = props.itemKind === 'fsrs' && props.hasAnswer && props.isAnswerRevealed;

  return (
    <footer className="fixed inset-x-0 bottom-0 z-surface-overlay border-t border-companion-divider bg-companion-content px-4 pt-3 pb-5 [padding-left:1rem] [padding-right:1rem] supports-[padding-bottom:max(0px)]:pb-[max(env(safe-area-inset-bottom),20px)] shadow-panel">
      <div className="mx-auto w-full max-w-[760px]">
        <ReviewActionBar
          ariaLabel={t('companion.review.toolbar')}
          className="h-auto border-0 bg-transparent px-0"
          key={props.reviewCardKey}
          mode="study"
          primary={
            props.itemKind === 'reading' ? (
              <ReadingReviewActions
                actionButtonClassName="min-w-0 flex-1 border-border px-2"
                groupClassName={actionGroupClassName}
                onReadReviewTopic={props.onReadReviewTopic}
                onPostponeReviewTopic={props.onPostponeReviewTopic}
                onDismissReviewTopic={props.onDismissReviewTopic}
              />
            ) : !canGradeFsrs ? (
              <FsrsRevealAction disabled={!props.hasAnswer} onRevealAnswer={props.onRevealAnswer} />
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
          reviewInputMode="hotkeys"
          reviewItemKind={props.itemKind}
          secondary={null}
        />
      </div>
    </footer>
  );
}
