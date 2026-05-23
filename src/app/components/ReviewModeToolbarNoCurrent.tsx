import { useEffect, type CSSProperties } from 'react';

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
  style
}: Pick<ReviewNoCurrentItemBarProps, 'className' | 'onContinueReading' | 'style'>) {
  useSpaceShortcut(onContinueReading);

  return (
    <ReviewActionBar
      ariaLabel="Flow toolbar"
      {...definedProps({ style })}
      mode="study"
      className={[className, 'pb-1'].filter(Boolean).join(' ')}
      primary={<ContinueReadingAction onContinueReading={onContinueReading} />}
      progress={null}
      secondary={null}
    />
  );
}

function ReviewResumeBar({
  className,
  onResumeReviewItem,
  showSummary,
  style
}: Pick<ReviewNoCurrentItemBarProps, 'className' | 'onResumeReviewItem' | 'showSummary' | 'style'>) {
  useSpaceShortcut(onResumeReviewItem);

  return (
    <ReviewActionBar
      ariaLabel="Flow toolbar"
      {...definedProps({ className, style })}
      mode="study"
      primary={<ResumeReviewAction onResumeReviewItem={onResumeReviewItem} />}
      progress={null}
      secondary={showSummary ? 'Flow mode' : null}
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
    <ReviewResumeBar
      onResumeReviewItem={onResumeReviewItem}
      {...definedProps({ showSummary })}
      {...definedProps({ className, style })}
    />
  );
}
