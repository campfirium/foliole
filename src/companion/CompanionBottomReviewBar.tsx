import { FsrsRevealAction, ReadingReviewActions, ReviewActionBar, ReviewGradeActions } from '../shared/ui';

import type { BottomBarGrade } from './CompanionFloatingBars';

export function CompanionBottomReviewBar(props: {
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
  if (!props.visible) {
    return null;
  }

  return (
    <footer className="fixed inset-x-0 bottom-0 z-surface-overlay border-t border-companion-divider bg-companion-content px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] shadow-panel">
      <div className="mx-auto w-full max-w-[760px]">
        <ReviewActionBar
          ariaLabel="Companion review toolbar"
          className="h-auto border-0 bg-transparent px-0"
          key={props.reviewCardKey}
          mode="study"
          primary={
            props.itemKind === 'reading' ? (
              <ReadingReviewActions
                onReadReviewTopic={props.onReadReviewTopic}
                onPostponeReviewTopic={props.onPostponeReviewTopic}
                onDismissReviewTopic={props.onDismissReviewTopic}
              />
            ) : !props.isAnswerRevealed ? (
              <FsrsRevealAction onRevealAnswer={props.onRevealAnswer} />
            ) : (
              <ReviewGradeActions
                buttonClassName="min-w-0 flex-1 px-3"
                buttonVariant="primary"
                errorMessage={null}
                groupClassName="w-full gap-2"
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
