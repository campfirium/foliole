import { useEffect, type CSSProperties } from 'react';

import { DEFAULT_APP_COMMAND_SHORTCUTS } from '../../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { getCommandShortcutOverrides, resolveCommandShortcutMap } from '../../shared/commands/keymap';
import { matchesShortcutSet } from '../../shared/commands/shortcuts';
import { definedProps } from '../../shared/lib/definedProps';
import { ReviewActionBar } from '../../shared/ui';
import { isEditableKeyboardTarget } from '../hooks/workspaceKeyboardTarget';

import { ContinueReadingAction, ResumeReviewAction } from './ReviewModeToolbarActions';
import { QueueClearFlowControl } from './ReviewSessionModeControl';
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
  surface?: 'panel' | 'overlay';
  style?: CSSProperties;
}

function getReadingReadShortcuts() {
  return resolveCommandShortcutMap({
    commandIds: [APP_COMMAND_IDS.readingReviewRead],
    defaults: DEFAULT_APP_COMMAND_SHORTCUTS,
    overrides: getCommandShortcutOverrides()
  })[APP_COMMAND_IDS.readingReviewRead];
}

function useReadingReadShortcut(action: () => void) {
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
        isEditableKeyboardTarget(event.target) ||
        isEditableKeyboardTarget(document.activeElement) ||
        !matchesShortcutSet(event, getReadingReadShortcuts())
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

  return (
    <ReviewActionBar
      ariaLabel="Flow toolbar"
      {...definedProps({ className, style })}
      mode="study"
      primary={
        <ReviewToolbarSessionActions
          actions={<ResumeReviewAction onResumeReviewItem={onResumeReviewItem} />}
          modeControl={<span aria-hidden="true" className="size-8" />}
          {...definedProps({ surface })}
        />
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
