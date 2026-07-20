import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncResult } from '../shared/platform/companionDesktopSyncObjects';
import { recordCompanionWorkspaceSyncEvent } from '../shared/platform/companionWorkspaceSync';

type StageEventInput = {
  endpointUrl: string;
  runId: string;
  startedAt: string;
};

function formatBytes(bytes: number | null | undefined) {
  if (typeof bytes !== 'number' || bytes <= 0) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatElapsed(elapsedMs: number | undefined) {
  if (typeof elapsedMs !== 'number' || elapsedMs <= 0) return null;
  const seconds = Math.round(elapsedMs / 1000);
  return seconds < 60 ? `${Math.max(1, seconds)}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function stripSentenceEnd(value: string) {
  return value.replace(/[.!?]\s*$/, '');
}

function withByteSuffix(label: string, bytes: number | null | undefined) {
  const byteLabel = formatBytes(bytes);
  return byteLabel ? `${label} (${byteLabel})` : label;
}

function stageEvent(message: string, result: NativeCompanionSyncEvent['result'] = 'partial') {
  return {
    kind: 'stage_finished' as const,
    message,
    result,
    status: result === 'failed' ? 'failed' as const : 'completed' as const
  };
}

function structureStage(result: CompanionDesktopSyncResult) {
  const elapsed = formatElapsed(result.syncedStructureElapsedMs);
  const count = result.appliedPackObjectCount;
  const suffix = elapsed ? ` in ${elapsed}` : '';
  return stageEvent(count > 0
    ? `Topic list synced; applied ${formatCount(count, 'change', 'changes')}${suffix}.`
    : `Topic list checked; no new changes${suffix}.`, 'completed');
}

function contentStage(result: CompanionDesktopSyncResult) {
  const count = result.syncedContentBlobHashes.length;
  if (count === 0 && !result.contentBlobError) return null;
  if (result.contentBlobError) {
    return stageEvent(`Body downloads failed; ${stripSentenceEnd(result.contentBlobError)}.`, 'failed');
  }
  const downloaded = withByteSuffix(formatCount(count, 'body file', 'body files'), result.syncedContentBlobBytes);
  const elapsed = formatElapsed(result.syncedContentBlobElapsedMs);
  return stageEvent(`Body files downloaded; ${downloaded}${elapsed ? ` in ${elapsed}` : ''}.`, 'completed');
}

function attachmentStage(result: CompanionDesktopSyncResult) {
  const count = result.syncedAttachmentIds.length;
  if (count === 0 && !result.attachmentResourceError) return null;
  if (result.attachmentResourceError) {
    return stageEvent(`Attachment files failed; ${stripSentenceEnd(result.attachmentResourceError)}.`, 'failed');
  }
  const downloaded = withByteSuffix(formatCount(count, 'attachment file', 'attachment files'), result.syncedAttachmentResourceBytes);
  const elapsed = formatElapsed(result.syncedAttachmentResourceElapsedMs);
  return stageEvent(`Attachment files downloaded; ${downloaded}${elapsed ? ` in ${elapsed}` : ''}.`, 'completed');
}

function pushStage(result: CompanionDesktopSyncResult) {
  const issueCount = Math.max(result.pushIssueCount ?? 0, result.pushConflictCount + result.pushRejectedCount);
  if (result.pushError) return stageEvent(`Device changes were not sent; ${stripSentenceEnd(result.pushError)}.`, 'partial');
  if (issueCount > 0) {
    return stageEvent(
      `Device changes were not sent; ${formatCount(issueCount, 'change was', 'changes were')} rejected or conflicted by desktop.`,
      'partial'
    );
  }
  if ((result.pendingAckCount ?? 0) > 0) {
    return stageEvent(`Device changes are waiting for desktop confirmation; ${formatCount(result.pendingAckCount ?? 0, 'change', 'changes')} pending.`, 'partial');
  }
  if ((result.localDirtyCount ?? 0) > 0) {
    return stageEvent(`Device changes are waiting to be sent; ${formatCount(result.localDirtyCount ?? 0, 'change', 'changes')} pending.`, 'partial');
  }
  return null;
}

export async function recordCompanionSyncStageEvents(
  args: StageEventInput,
  result: CompanionDesktopSyncResult
) {
  const events = [
    structureStage(result),
    contentStage(result),
    attachmentStage(result),
    pushStage(result)
  ].filter((event): event is ReturnType<typeof stageEvent> => event !== null);
  for (const event of events) {
    await recordCompanionWorkspaceSyncEvent({
      endpointUrl: args.endpointUrl,
      kind: event.kind,
      message: event.message,
      result: event.result,
      runId: args.runId,
      startedAt: args.startedAt,
      status: event.status
    });
  }
}
