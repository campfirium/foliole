import { FsrsRevealAction, ReadingReviewActions, ReviewActionBar, ReviewGradeActions } from '../shared/ui';

import type { BottomBarGrade } from './CompanionFloatingBars';

export function CompanionBottomReviewBar(props: {
  disabled?: boolean;
  isAnswerRevealed: boolean;
  itemKind: 'fsrs' | 'reading';
  onCompleteReviewItem: () => void;
  onDeferReviewItem: () => void;
  onDismissReviewItem: () => void;
  onGrade: (grade: BottomBarGrade) => void;
  onRevealAnswer: () => void;
  statusLabel?: string | null;
  visible: boolean;
}) {
  if (!props.visible) {
    return null;
  }

  return (
    <footer className="fixed inset-x-0 bottom-0 z-20 px-4 pb-5">
      <div className="mx-auto w-full max-w-[760px]">
        <ReviewActionBar
          ariaLabel="Companion review toolbar"
          className="rounded-3xl border border-border shadow-panel"
          mode="study"
          primary={
            props.itemKind === 'reading' ? (
              <ReadingReviewActions
                onCompleteReviewItem={props.onCompleteReviewItem}
                onDeferReviewItem={props.onDeferReviewItem}
                onDismissReviewItem={props.onDismissReviewItem}
              />
            ) : !props.isAnswerRevealed ? (
              <FsrsRevealAction onRevealAnswer={props.onRevealAnswer} />
            ) : (
              <ReviewGradeActions
                errorMessage={null}
                isSubmitting={Boolean(props.disabled)}
                submitGrade={async (grade) => props.onGrade(grade as BottomBarGrade)}
              />
            )
          }
          reviewInputMode="hotkeys"
          reviewItemKind={props.itemKind}
          secondary={props.statusLabel ?? null}
        />
      </div>
    </footer>
  );
}
