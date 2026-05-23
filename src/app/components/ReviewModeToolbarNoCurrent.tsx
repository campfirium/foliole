import { useEffect, type CSSProperties } from 'react';

import { definedProps } from '../../shared/lib/definedProps';
import { ReviewActionBar } from '../../shared/ui';

import { ContinueReadingAction, ResumeReviewAction } from './ReviewModeToolbarActions';
import { ReviewToolbarSessionActions, type ReviewToolbarSessionSummary } from './ReviewToolbarSessionFrame';

interface ReviewNoCurrentItemBarProps {
  className?: string;
  onContinueReading: () => void;
  onResumeReviewItem: () => void;
  reviewCompletedCount: number;
  reviewQueueCount: number;
  reviewSummary?: ReviewToolbarSessionSummary;
  reviewStatus: 'idle' | 'awaiting-answer' | 'answer-revealed' | 'completed';
  showSummary?: boolean;
  style?: CSSProperties;
}

function isEditableOrInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.isContentEditable ||
      target.closest('button, a, input, textarea, select, [contenteditable="true"], [role="button"], [role="menuitem"]')
  );
}

function useSpaceShortcut(action: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.isComposing ||
        event.repeat ||
        (event.key !== ' ' && event.code !== 'Space') ||
        isEditableOrInteractiveTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [action]);
}

function ReviewCompleteBar({
  className,
  onContinueReading,
  reviewSummary,
  style
}: Pick<ReviewNoCurrentItemBarProps, 'className' | 'onContinueReading' | 'reviewSummary' | 'style'>) {
  useSpaceShortcut(onContinueReading);

  return (
    <ReviewActionBar
      ariaLabel="Flow toolbar"
      {...definedProps({ style })}
      mode="study"
      className={[className, 'pb-1'].filter(Boolean).join(' ')}
      primary={
        <ReviewToolbarSessionActions
          actions={<ContinueReadingAction onContinueReading={onContinueReading} />}
          modeControl={<span aria-hidden="true" className="size-8" />}
          {...definedProps({ summary: reviewSummary })}
        />
      }
      progress={null}
      secondary={null}
    />
  );
}

function ReviewResumeBar({
  className,
  onResumeReviewItem,
  reviewSummary,
  showSummary,
  style
}: Pick<ReviewNoCurrentItemBarProps, 'className' | 'onResumeReviewItem' | 'reviewSummary' | 'showSummary' | 'style'>) {
  useSpaceShortcut(onResumeReviewItem);

  return (
    <ReviewActionBar
      ariaLabel="Flow toolbar"
      {...definedProps({ className, style })}
      mode="study"
      primary={
        <ReviewToolbarSessionActions
          actions={<ResumeReviewAction onResumeReviewItem={onResumeReviewItem} />}
          modeControl={<span aria-hidden="true" className="size-8" />}
          {...definedProps({ summary: reviewSummary })}
        />
      }
      progress={null}
      secondary={showSummary ? 'Flow mode' : null}
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
  style
}: ReviewNoCurrentItemBarProps) {
  if (reviewStatus === 'completed') {
    return (
      <ReviewCompleteBar
        onContinueReading={onContinueReading}
        {...definedProps({ reviewSummary })}
        {...definedProps({ className, style })}
      />
    );
  }

  return (
    <ReviewResumeBar
      onResumeReviewItem={onResumeReviewItem}
      {...definedProps({ reviewSummary })}
      {...definedProps({ showSummary })}
      {...definedProps({ className, style })}
    />
  );
}
