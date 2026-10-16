import type { NativeCompanionSyncEventSummary } from '../../lib/platform/nativeCompanionSyncContract';
import { definedProps } from '../shared/lib/definedProps';
import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';

function knownCount(value: number | null | undefined) {
  return typeof value === 'number' && value > 0 ? value : 0;
}

function uniqueCount(values: string[] | undefined) {
  return new Set(values ?? []).size;
}

function durationMs(startedAt: string, occurredAt: string) {
  const started = new Date(startedAt).getTime();
  const occurred = new Date(occurredAt).getTime();
  return Number.isFinite(started) && Number.isFinite(occurred) && occurred >= started
    ? occurred - started
    : undefined;
}

export function buildCompanionSyncRunSummary(args: {
  occurredAt: string;
  result: CompanionDesktopSyncResult;
  startedAt: string;
}): NativeCompanionSyncEventSummary {
  const desktopReviewCount = Math.max(
    knownCount(args.result.pushIssueCount),
    knownCount(args.result.pushConflictCount) + knownCount(args.result.pushRejectedCount)
  );
  const waitingConfirmationCount = desktopReviewCount > 0 ? 0 : knownCount(args.result.pendingAckCount);
  const waitingSendCount = desktopReviewCount > 0 || waitingConfirmationCount > 0 ? 0 : knownCount(args.result.localDirtyCount);
  const changeCount =
    knownCount(args.result.appliedPackObjectCount) +
    knownCount(args.result.transferredAttachmentCount) +
    uniqueCount(args.result.pushedObjectIds) +
    uniqueCount(args.result.pushedReviewOpIds) +
    desktopReviewCount +
    waitingConfirmationCount +
    waitingSendCount;
  return {
    change_count: changeCount,
    ...definedProps({
      database_duration_ms: args.result.syncedStructureElapsedMs,
      attachment_duration_ms: args.result.syncedAttachmentResourceElapsedMs,
      attachment_count: args.result.transferredAttachmentCount,
      received_count: args.result.appliedObjectIds.length,
      desktop_review_count: desktopReviewCount || undefined,
      duration_ms: durationMs(args.startedAt, args.occurredAt),
      waiting_confirmation_count: waitingConfirmationCount || undefined,
      waiting_send_count: waitingSendCount || undefined
    })
  };
}
