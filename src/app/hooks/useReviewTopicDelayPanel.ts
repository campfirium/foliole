import { useCallback, useMemo, useState } from 'react';

import { resolveTopicPostponeDelayNextAt } from '../../../lib/core/review/topicPostponeDelay';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

import type { useWorkspaceSelectors } from './appControllerState';

const DEFAULT_DELAY_LEVEL = 4;
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function canDelayNode(args: {
  nodeId: string | null | undefined;
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'nodesById' | 'trashedNodeIds'>;
}) {
  if (!args.nodeId || args.ws.trashedNodeIds.includes(args.nodeId)) return false;
  const node = args.ws.nodesById[args.nodeId];
  return Boolean(node && node.kind === 'topic' && node.reading?.state !== 'dismissed');
}

function formatDueDate(args: {
  level: number;
  now: string;
  reading: { intervalDurationMs: number; lastHandledAt: string } | null | undefined;
}) {
  const reading = args.reading ?? { intervalDurationMs: 0, lastHandledAt: args.now };
  const nextAt = resolveTopicPostponeDelayNextAt({ level: args.level, now: args.now, reading });
  return DATE_FORMATTER.format(new Date(nextAt));
}

export function useReviewTopicDelayPanel(args: {
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'activeNodeId' | 'nodesById' | 'setReviewTopicDelay' | 'trashedNodeIds'>;
}) {
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState(DEFAULT_DELAY_LEVEL);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const close = useCallback(() => {
    setTargetNodeId(null);
    setOpenedAt(null);
    setErrorMessage(null);
    setIsSubmitting(false);
  }, []);

  const open = useCallback((nodeId?: string | null) => {
    const nextTargetNodeId = nodeId ?? args.ws.activeNodeId;
    if (!canDelayNode({ nodeId: nextTargetNodeId, ws: args.ws })) {
      showAppRuntimeNotice('Postpone is available for topics that have not been dismissed.');
      return false;
    }
    setTargetNodeId(nextTargetNodeId);
    setOpenedAt(new Date().toISOString());
    setSelectedLevel(DEFAULT_DELAY_LEVEL);
    setErrorMessage(null);
    return true;
  }, [args.ws]);

  const submit = useCallback(async (level: number) => {
    if (!targetNodeId || isSubmitting) return false;
    setIsSubmitting(true);
    const saved = await args.ws.setReviewTopicDelay(targetNodeId, level, openedAt ?? new Date().toISOString());
    if (!saved) {
      setErrorMessage('Failed to save postpone. Please retry.');
      setIsSubmitting(false);
      return false;
    }
    close();
    return true;
  }, [args.ws, close, isSubmitting, openedAt, targetNodeId]);

  const dueDateLabel = useMemo(() => {
    const node = targetNodeId ? args.ws.nodesById[targetNodeId] : null;
    return formatDueDate({
      level: selectedLevel,
      now: openedAt ?? new Date().toISOString(),
      reading: node?.reading
    });
  }, [args.ws.nodesById, openedAt, selectedLevel, targetNodeId]);

  return useMemo(() => ({
    close,
    dueDateLabel,
    errorMessage,
    isOpen: Boolean(targetNodeId),
    isSubmitting,
    open,
    selectedLevel,
    setSelectedLevel,
    submit
  }), [close, dueDateLabel, errorMessage, isSubmitting, open, selectedLevel, submit, targetNodeId]);
}
