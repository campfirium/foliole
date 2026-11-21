import { useCallback, useEffect, useState } from 'react';

import { loadRecentErrorSummary } from '../platform/diagnosticBundle';
import { isDesktopRuntime } from '../platform/runtime';

import { FEEDBACK_LIMITS } from './feedbackContract';

export const FEEDBACK_ERROR_SUMMARY_HEADING = 'Recent errors (attached automatically, personal details removed):';
const SEPARATOR = '\n\n---\n';
const MIN_SUMMARY_BUDGET = 120;

// The user's own text always survives in full; summary lines are dropped from the oldest end to fit.
export function appendFeedbackErrorSummary(message: string, summary: string | null) {
  if (!summary) return message;
  const budget = FEEDBACK_LIMITS.messageLength - message.trim().length - SEPARATOR.length - FEEDBACK_ERROR_SUMMARY_HEADING.length - 1;
  if (budget < MIN_SUMMARY_BUDGET) return message;
  const lines = summary.split('\n');
  const kept: string[] = [];
  let used = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? '';
    if (used + line.length + 1 > budget) {
      if (index === 0 && line.startsWith('Platform:')) continue;
      break;
    }
    kept.unshift(line);
    used += line.length + 1;
  }
  if (!kept.some((line) => line.startsWith('- '))) return message;
  return `${message.trim()}${SEPARATOR}${FEEDBACK_ERROR_SUMMARY_HEADING}\n${kept.join('\n')}`;
}

export function useFeedbackErrorSummaryOption(open: boolean, eligible: boolean) {
  const available = eligible && isDesktopRuntime();
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    if (open) setEnabled(true);
  }, [open]);
  const prepareMessage = useCallback(async (message: string) => {
    if (!available || !enabled) return message;
    return appendFeedbackErrorSummary(message, await loadRecentErrorSummary());
  }, [available, enabled]);
  const toggle = available ? { checked: enabled, onCheckedChange: setEnabled } : undefined;
  return { prepareMessage, toggle };
}
