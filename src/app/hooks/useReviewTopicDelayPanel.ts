import { useCallback, useMemo, useState } from 'react';

import { resolveTopicPostponeDelayNextAt } from '../../../lib/core/review/topicPostponeDelay';

import type { useWorkspaceSelectors } from './appControllerState';
import { useReviewTopicDelayTarget } from './useReviewTopicDelayTarget';

const DEFAULT_DELAY_LEVEL = 4;
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function formatDueDate(level: number, now: string, reading: { intervalDurationMs: number; lastHandledAt: string } | null | undefined) {
  const nextAt = resolveTopicPostponeDelayNextAt({ level, now, reading: reading ?? { intervalDurationMs: 0, lastHandledAt: now } });
  return DATE_FORMATTER.format(new Date(nextAt));
}

export function useReviewTopicDelayPanel(args: {
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'activeNodeId' | 'nodesById' | 'setReviewTopicDelay' | 'trashedNodeIds'>;
}) {
  const { target, learningNode, close: closeTarget, open: openTarget, isCurrent, refresh } = useReviewTopicDelayTarget(args.ws);
  const [selectedLevel, setSelectedLevel] = useState(DEFAULT_DELAY_LEVEL);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const close = useCallback(() => {
    closeTarget();
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [closeTarget]);
  const open = useCallback((nodeId?: string | null) => {
    if (!openTarget(nodeId)) return false;
    setSelectedLevel(DEFAULT_DELAY_LEVEL);
    setErrorMessage(null);
    setIsSubmitting(false);
    return true;
  }, [openTarget]);
  const submit = useCallback(async (level: number) => {
    if (!target || isSubmitting || !learningNode) return false;
    setIsSubmitting(true);
    const saved = await args.ws.setReviewTopicDelay(target.nodeId, level, target.openedAt, learningNode.reading ?? null);
    if (!isCurrent(target)) return false;
    if (!saved) {
      setErrorMessage('Failed to save postpone. Please retry.');
      setIsSubmitting(false);
      refresh(target);
      return false;
    }
    close();
    return true;
  }, [args.ws, close, isCurrent, isSubmitting, learningNode, refresh, target]);
  const dueDateLabel = useMemo(() => target && !learningNode ? '…'
    : formatDueDate(selectedLevel, target?.openedAt ?? new Date().toISOString(), learningNode?.reading),
  [learningNode, selectedLevel, target]);
  return useMemo(() => ({ close, dueDateLabel, errorMessage, isOpen: Boolean(target),
    isSubmitting: isSubmitting || Boolean(target && !learningNode), open, selectedLevel, setSelectedLevel, submit
  }), [close, dueDateLabel, errorMessage, isSubmitting, learningNode, open, selectedLevel, submit, target]);
}
