import type { CSSProperties } from 'react';

import { definedProps } from '../../shared/lib/definedProps';
import { ReviewActionBar } from '../../shared/ui';

import { ContinueReadingAction, ResumeReviewAction } from './ReviewModeToolbarActions';
import { QueueClearFlowControl } from './ReviewSessionModeControl';
import { ReviewToolbarSessionActions, type ReviewToolbarSessionSummary } from './ReviewToolbarSessionFrame';
import { useReadingReadShortcut } from './useReadingReadShortcut';

interface ReviewNoCurrentItemBarProps {
  className?: string;
  onContinueReading: () => void;
  onResumeReviewItem: () => void;
  reviewCompletedCount: number;
  reviewQueueCount: number;
  reviewSummary?: ReviewToolbarSessionSummary;
  reviewStatus: 'idle' | 'awaiting-answer' | 'answer-revealed' | 'completed';
  showSummary?: boolean;
  surface?: 'panel' | 'overlay';
  style?: CSSProperties;
}

function ReviewCompleteBar({
  className,
  onContinueReading,
  surface,
  style
}: Pick<ReviewNoCurrentItemBarProps, 'className' | 'onContinueReading' | 'reviewSummary' | 'surface' | 'style'>) {
  useReadingReadShortcut(onContinueReading);

  return (
    <ReviewActionBar
      ariaLabel="Flow toolbar"
      {...definedProps({ style })}
      mode="study"
      className={[className, 'pb-1'].filter(Boolean).join(' ')}
      primary={
        <ReviewToolbarSessionActions
          actions={<ContinueReadingAction onContinueReading={onContinueReading} />}
          modeControl={<QueueClearFlowControl />}
          {...definedProps({ surface })}
        />
      }
      progress={null}
      secondary={null}
      {...definedProps({ surface })}
    />
  );
}

function ReviewResumeBar({
  className,
  onResumeReviewItem,
  showSummary,
  surface,
  style
}: Pick<ReviewNoCurrentItemBarProps, 'className' | 'onResumeReviewItem' | 'reviewSummary' | 'showSummary' | 'surface' | 'style'>) {
  useReadingReadShortcut(onResumeReviewItem);
  const resumeAction = <ResumeReviewAction onResumeReviewItem={onResumeReviewItem} {...definedProps({ surface })} />;

  return (
    <ReviewActionBar
      ariaLabel="Flow toolbar"
      {...definedProps({ className, style })}
      mode="study"
      primary={
        surface === 'overlay' ? (
          resumeAction
        ) : (
          <ReviewToolbarSessionActions
            actions={resumeAction}
            modeControl={<span aria-hidden="true" className="size-8" />}
            {...definedProps({ surface })}
          />
        )
      }
      progress={null}
      secondary={showSummary ? 'Flow mode' : null}
      {...definedProps({ surface })}
    />
  );
}

export function ReviewNoCurrentItemBar({
  className,
  onContinueReading,
  onResumeReviewItem,
  reviewSummary,
  reviewStatus,
  showSummary,
  surface,
  style
}: ReviewNoCurrentItemBarProps) {
  if (reviewStatus === 'completed') {
    if (!reviewSummary?.canContinueReading) {
      return null;
    }
    return (
      <ReviewCompleteBar
        onContinueReading={onContinueReading}
        {...definedProps({ reviewSummary })}
        {...definedProps({ className, style })}
        {...definedProps({ surface })}
      />
    );
  }

  return (
    <ReviewResumeBar
      onResumeReviewItem={onResumeReviewItem}
      {...definedProps({ reviewSummary })}
      {...definedProps({ showSummary })}
      {...definedProps({ className, style })}
      {...definedProps({ surface })}
    />
  );
}
