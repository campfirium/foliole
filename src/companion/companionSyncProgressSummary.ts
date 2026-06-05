import type { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';

export type CompanionSyncProgressSummary = {
  detail: string | null;
  status: string;
  title: string;
};

type Translate = ReturnType<typeof useTranslation>;

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

function formatSyncPhase(progress: CompanionDesktopSyncProgress, t: Translate) {
  if (progress.phase === 'structure') return t('companion.sync.progress.libraryIndex');
  if (isActiveTopicProgress(progress)) return t('companion.sync.progress.currentTopic');
  if (isReviewQueueProgress(progress)) return t('companion.sync.progress.reviewResources');
  if (progress.phase === 'attachment') return t('companion.sync.progress.attachments');
  return t('companion.sync.progress.bodyDownloads');
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

function fallbackT(t: Translate, key: Parameters<Translate>[0], values?: Parameters<Translate>[1]) {
  try {
    return t(key, values);
  } catch {
    return null;
  }
}

function formatContentBreakdown(progress: CompanionDesktopSyncProgress, t: Translate) {
  const breakdown = progress.contentBreakdown;
  if (progress.phase !== 'content' || !breakdown) return null;
  const body = t('companion.sync.progress.body');
  const bodies = t('companion.sync.progress.bodies');
  const currentTopic = t('companion.sync.progress.currentTopic');
  const reviewQueue = t('companion.sync.progress.reviewQueue');
  if (isActiveTopicProgress(progress)) return `${currentTopic}: ${countLabel(breakdown.activeTopicBodies, body, bodies)}`;
  if (isReviewQueueProgress(progress)) return `${reviewQueue}: ${countLabel(breakdown.dueReviewBodies, body, bodies)}`;
  const segments = [
    [t('companion.sync.progress.topLevel'), breakdown.topLevelTopicBodies],
    [t('companion.sync.progress.nested'), breakdown.nestedTopicBodies],
    [t('companion.sync.progress.external'), breakdown.externalDocumentBodies],
    [reviewQueue, breakdown.dueReviewBodies]
  ].filter((segment): segment is [string, number] => typeof segment[1] === 'number');
  return segments.map(([label, count]) => `${label} ${count}`).join(' · ') || null;
}

function formatAttachmentBreakdown(progress: CompanionDesktopSyncProgress, t: Translate) {
  const breakdown = progress.attachmentBreakdown;
  if (progress.phase !== 'attachment' || !breakdown) return null;
  const attachment = t('companion.sync.progress.attachment');
  const attachments = t('companion.sync.progress.attachmentsCount');
  const currentTopic = t('companion.sync.progress.currentTopic');
  const reviewQueue = t('companion.sync.progress.reviewQueue');
  if (isActiveTopicProgress(progress)) return `${currentTopic}: ${countLabel(breakdown.activeTopicAttachments, attachment, attachments)}`;
  if (isReviewQueueProgress(progress)) return `${reviewQueue}: ${countLabel(breakdown.dueReviewAttachments, attachment, attachments)}`;
  const segments = [
    [t('companion.sync.progress.images'), breakdown.imageAttachments],
    [t('companion.sync.progress.pdfs'), breakdown.pdfAttachments],
    [t('companion.sync.progress.other'), breakdown.otherAttachments]
  ].filter((segment): segment is [string, number] => typeof segment[1] === 'number');
  return segments.map(([label, count]) => `${label} ${count}`).join(' · ') || null;
}

function displayTotal(progress: CompanionDesktopSyncProgress) {
  if (isActiveTopicProgress(progress)) return activeTopicTotal(progress);
  if (isReviewQueueProgress(progress)) return reviewQueueTotal(progress);
  return progress.total ?? 0;
}

function progressCountLabel(progress: CompanionDesktopSyncProgress, completed: number, total: number, t: Translate) {
  if (progress.mode === 'remaining' && progress.total !== null) return t('companion.sync.progress.left', { count: total });
  return progress.total === null ? t('companion.sync.progress.checking') : `${completed}/${total}`;
}

export function formatCompanionSyncProgressSummary(progress: CompanionDesktopSyncProgress, t: Translate): CompanionSyncProgressSummary {
  const total = displayTotal(progress);
  const completed = visibleCompleted(progress, total);
  const count = progressCountLabel(progress, completed, total, t);
  const showBytes = !isActiveTopicProgress(progress) && !isReviewQueueProgress(progress);
  const byteLabel = showBytes && progress.totalBytes != null && progress.completedBytes != null
    ? `${formatBytes(progress.completedBytes)}/${formatBytes(progress.totalBytes)}`
    : null;
  const elapsedLabel = formatElapsedTime(progress.elapsedMs);
  const failedLabel = progress.failedCount && progress.failedCount > 0
    ? fallbackT(t, 'companion.sync.progress.failed', { count: progress.failedCount }) ?? `${progress.failedCount} failed`
    : null;
  return {
    detail: formatContentBreakdown(progress, t) ?? formatAttachmentBreakdown(progress, t),
    status: [byteLabel ? `${count} - ${byteLabel}` : count, failedLabel, elapsedLabel].filter(Boolean).join(' · '),
    title: formatSyncPhase(progress, t)
  };
}
