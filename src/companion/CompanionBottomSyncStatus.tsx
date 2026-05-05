import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';

function countLabel(count: number | undefined, singular: string, plural: string) {
  const value = count ?? 0;
  return `${value} ${value === 1 ? singular : plural}`;
}

function reviewQueueTotal(progress: CompanionDesktopSyncProgress) {
  if (progress.phase === 'content') return progress.contentBreakdown?.dueReviewBodies ?? 0;
  if (progress.phase === 'attachment') return progress.attachmentBreakdown?.dueReviewAttachments ?? 0;
  return 0;
}

function activeTopicTotal(progress: CompanionDesktopSyncProgress) {
  if (progress.phase === 'content') return progress.contentBreakdown?.activeTopicBodies ?? 0;
  if (progress.phase === 'attachment') return progress.attachmentBreakdown?.activeTopicAttachments ?? 0;
  return 0;
}

function clampCount(value: number, total: number) {
  return Math.min(Math.max(0, value), total);
}

function isActiveTopicProgress(progress: CompanionDesktopSyncProgress) {
  const total = activeTopicTotal(progress);
  return total > 0 && progress.completed < total;
}

function isReviewQueueProgress(progress: CompanionDesktopSyncProgress) {
  const activeTotal = activeTopicTotal(progress);
  const total = reviewQueueTotal(progress);
  return total > 0 && progress.completed < activeTotal + total;
}

function visibleCompleted(progress: CompanionDesktopSyncProgress, total: number) {
  if (isActiveTopicProgress(progress)) return clampCount(progress.completed, total);
  if (isReviewQueueProgress(progress)) return clampCount(progress.completed - activeTopicTotal(progress), total);
  return clampCount(progress.completed, total);
}

function formatSyncPhase(progress: CompanionDesktopSyncProgress) {
  if (progress.phase === 'structure') return 'Library index';
  if (isActiveTopicProgress(progress)) return 'Current topic';
  if (isReviewQueueProgress(progress)) return 'Review resources';
  if (progress.phase === 'attachment') return 'Attachments';
  return 'Topic bodies';
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatElapsedTime(elapsedMs: number | undefined) {
  if (typeof elapsedMs !== 'number' || elapsedMs < 1000) return null;
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function formatContentBreakdown(progress: CompanionDesktopSyncProgress) {
  const breakdown = progress.contentBreakdown;
  if (progress.phase !== 'content' || !breakdown) return null;
  if (isActiveTopicProgress(progress)) return `Current topic: ${countLabel(breakdown.activeTopicBodies, 'body', 'bodies')}`;
  if (isReviewQueueProgress(progress)) return `Review queue: ${countLabel(breakdown.dueReviewBodies, 'body', 'bodies')}`;
  const segments = [
    ['Top-level', breakdown.topLevelTopicBodies],
    ['Nested', breakdown.nestedTopicBodies],
    ['External', breakdown.externalDocumentBodies],
    ['Review queue', breakdown.dueReviewBodies]
  ].filter((segment): segment is [string, number] => typeof segment[1] === 'number');
  return segments.map(([label, count]) => `${label} ${count}`).join(' · ') || null;
}

function formatAttachmentBreakdown(progress: CompanionDesktopSyncProgress) {
  const breakdown = progress.attachmentBreakdown;
  if (progress.phase !== 'attachment' || !breakdown) return null;
  if (isActiveTopicProgress(progress)) return `Current topic: ${countLabel(breakdown.activeTopicAttachments, 'attachment', 'attachments')}`;
  if (isReviewQueueProgress(progress)) return `Review queue: ${countLabel(breakdown.dueReviewAttachments, 'attachment', 'attachments')}`;
  const segments = [
    ['Images', breakdown.imageAttachments],
    ['PDFs', breakdown.pdfAttachments],
    ['Other', breakdown.otherAttachments]
  ].filter((segment): segment is [string, number] => typeof segment[1] === 'number');
  return segments.map(([label, count]) => `${label} ${count}`).join(' · ') || null;
}

function displayTotal(progress: CompanionDesktopSyncProgress) {
  if (isActiveTopicProgress(progress)) return activeTopicTotal(progress);
  if (isReviewQueueProgress(progress)) return reviewQueueTotal(progress);
  return progress.total ?? 0;
}

function progressCountLabel(progress: CompanionDesktopSyncProgress, completed: number, total: number) {
  if (progress.mode === 'remaining' && progress.total !== null) return `${total} left`;
  return progress.total === null ? 'Checking' : `${completed}/${total}`;
}

export function CompanionBottomSyncStatus(props: {
  progress: CompanionDesktopSyncProgress | null;
}) {
  if (!props.progress) return null;
  const total = displayTotal(props.progress);
  const completed = visibleCompleted(props.progress, total);
  const ratio = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const count = progressCountLabel(props.progress, completed, total);
  const showBytes = !isActiveTopicProgress(props.progress) && !isReviewQueueProgress(props.progress);
  const byteLabel = showBytes && props.progress.totalBytes != null && props.progress.completedBytes != null
    ? `${formatBytes(props.progress.completedBytes)}/${formatBytes(props.progress.totalBytes)}`
    : null;
  const elapsedLabel = formatElapsedTime(props.progress.elapsedMs);
  const failedLabel = props.progress.failedCount && props.progress.failedCount > 0
    ? `${props.progress.failedCount} failed`
    : null;
  const statusLabel = [byteLabel ? `${count} - ${byteLabel}` : count, failedLabel, elapsedLabel].filter(Boolean).join(' · ');
  const detail = formatContentBreakdown(props.progress) ?? formatAttachmentBreakdown(props.progress);
  return (
    <section
      aria-label="Sync progress"
      className="mx-auto mb-2 w-full max-w-[760px] rounded-md border border-companion-divider bg-companion-subtle px-3 py-2 text-xs leading-5 text-companion-text-secondary"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-foreground">{formatSyncPhase(props.progress)}</span>
        <span className="shrink-0 tabular-nums">{statusLabel}</span>
      </div>
      {detail ? <div className="mt-0.5 truncate text-companion-text-secondary">{detail}</div> : null}
      {props.progress.total === null ? null : (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-companion-divider">
          <div className="h-full rounded-full bg-companion-accent" style={{ width: `${ratio}%` }} />
        </div>
      )}
    </section>
  );
}
