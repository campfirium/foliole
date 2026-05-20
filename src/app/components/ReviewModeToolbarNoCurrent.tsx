import type { CSSProperties } from 'react';

import { definedProps } from '../../shared/lib/definedProps';
import { ReviewActionBar } from '../../shared/ui';

import { ContinueReadingAction, ResumeReviewAction } from './ReviewModeToolbarActions';

interface ReviewNoCurrentItemBarProps {
  className?: string;
  onContinueReading: () => void;
  onResumeReviewItem: () => void;
  reviewCompletedCount: number;
  reviewQueueCount: number;
  reviewStatus: 'idle' | 'awaiting-answer' | 'answer-revealed' | 'completed';
  showSummary?: boolean;
  style?: CSSProperties;
}

function ReviewCompleteBar({
  className,
  onContinueReading,
  style
}: Pick<ReviewNoCurrentItemBarProps, 'className' | 'onContinueReading' | 'style'>) {
  return (
    <ReviewActionBar
      ariaLabel="Review mode toolbar"
      {...definedProps({ className, style })}
      mode="study"
      primary={<ContinueReadingAction onContinueReading={onContinueReading} />}
      progress={null}
      secondary={null}
    />
  );
}

export function ReviewNoCurrentItemBar({
  className,
  onContinueReading,
  onResumeReviewItem,
  reviewStatus,
  showSummary,
  style
}: ReviewNoCurrentItemBarProps) {
  if (reviewStatus === 'completed') {
    return (
      <ReviewCompleteBar
        onContinueReading={onContinueReading}
        {...definedProps({ className, style })}
      />
    );
  }

  return (
      <ReviewActionBar
      ariaLabel="Review mode toolbar"
      {...definedProps({ className, style })}
      mode="study"
      primary={<ResumeReviewAction onResumeReviewItem={onResumeReviewItem} />}
      progress={null}
      secondary={showSummary ? 'Study mode' : null}
    />
  );
}
