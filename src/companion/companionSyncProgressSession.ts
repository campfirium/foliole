import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { definedProps } from '../shared/lib/definedProps';

function mergeCount(previous: number, total: number, nextTotal: number, nextCompleted: number) {
  return Math.min(total, Math.max(previous, total - nextTotal + nextCompleted));
}

function mergeBytes(previous: CompanionDesktopSyncProgress, next: CompanionDesktopSyncProgress) {
  if (
    typeof previous.completedBytes !== 'number' ||
    typeof previous.totalBytes !== 'number' ||
    typeof next.completedBytes !== 'number' ||
    typeof next.totalBytes !== 'number' ||
    previous.totalBytes < next.totalBytes
  ) {
    return definedProps({ completedBytes: next.completedBytes, totalBytes: next.totalBytes });
  }
  return {
    completedBytes: mergeCount(previous.completedBytes, previous.totalBytes, next.totalBytes, next.completedBytes),
    totalBytes: previous.totalBytes
  };
}

export function mergeCompanionSyncProgressSession(
  previous: CompanionDesktopSyncProgress | null,
  next: CompanionDesktopSyncProgress | null
): CompanionDesktopSyncProgress | null {
  if (!previous || !next) return next;
  if (previous.phase !== next.phase) return next;
  if (previous.mode !== next.mode) return next;
  if (next.mode === 'remaining') return next;
  if (previous.total === null || next.total === null || previous.total < next.total) return next;
  return {
    ...next,
    ...mergeBytes(previous, next),
    completed: mergeCount(previous.completed, previous.total, next.total, next.completed),
    total: previous.total
  };
}
