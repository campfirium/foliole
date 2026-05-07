import type { CompanionSyncPassInput } from './companionSyncPassResult';

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatBacklogLabel(label: string, count: number | null, bytes?: number | null) {
  const countLabel = count === null ? `some ${label}` : `${count} ${label}`;
  return typeof bytes === 'number' && bytes > 0 ? `${countLabel} (${formatBytes(bytes)})` : countLabel;
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDownloadLabel(count: number, singular: string, plural: string, bytes?: number | null) {
  const label = formatCount(count, singular, plural);
  return typeof bytes === 'number' && bytes > 0 ? `${label} (${formatBytes(bytes)})` : label;
}

function formatElapsedTime(elapsedMs: number | undefined) {
  if (typeof elapsedMs !== 'number' || elapsedMs <= 0) return null;
  if (elapsedMs < 1000) return `${(elapsedMs / 1000).toFixed(1)}s`;
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function joinBacklogSuffix(prefix: string, suffix: string) {
  return `${prefix.replace(/[.;]\s*$/, '')}; ${suffix}`;
}

function joinPhrases(phrases: string[]) {
  if (phrases.length <= 2) return phrases.join(' and ');
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`;
}

export function formatSyncPassCount(count: number, singular: string, plural: string) {
  return formatCount(count, singular, plural);
}

export function appendDownloadSuffix(prefix: string, result: CompanionSyncPassInput) {
  const bodyCount = result.syncedContentBlobHashes?.length ?? 0;
  const attachmentCount = result.syncedAttachmentIds?.length ?? 0;
  const suffixes: string[] = [];
  if (bodyCount > 0) suffixes.push(formatDownloadLabel(bodyCount, 'topic body', 'topic bodies', result.syncedContentBlobBytes));
  if (attachmentCount > 0) {
    suffixes.push(formatDownloadLabel(attachmentCount, 'attachment file', 'attachment files', result.syncedAttachmentResourceBytes));
  }
  if (suffixes.length === 0) return prefix;
  const elapsed = formatElapsedTime(result.syncedResourceElapsedMs);
  const timeSuffix = elapsed ? ` in ${elapsed}` : '';
  return joinBacklogSuffix(prefix, `downloaded ${suffixes.join(' and ')} in this sync${timeSuffix}`);
}

export function appendStageTimingSuffix(prefix: string, result: CompanionSyncPassInput) {
  const timings = ([
    ['topic list', result.syncedStructureElapsedMs],
    ['topic bodies', result.syncedContentBlobElapsedMs],
    ['attachment files', result.syncedAttachmentResourceElapsedMs]
  ] satisfies Array<[string, number | undefined]>).flatMap(([label, elapsedMs]) => {
    const elapsed = formatElapsedTime(elapsedMs);
    return elapsed ? [`${label} ${elapsed}`] : [];
  });
  return timings.length === 0 ? prefix : joinBacklogSuffix(prefix, `timing: ${timings.join(', ')}`);
}

export function appendNativeBodyTimingSuffix(prefix: string, result: CompanionSyncPassInput) {
  const timing = result.syncedContentBlobNativeTiming;
  if (!timing || (result.syncedContentBlobHashes?.length ?? 0) === 0) return prefix;
  const timings = ([
    ['http', timing.httpElapsedMs],
    ['parse', timing.parseElapsedMs],
    ['db', timing.dbElapsedMs]
  ] satisfies Array<[string, number]>).flatMap(([label, elapsedMs]) => {
    const elapsed = formatElapsedTime(elapsedMs);
    return elapsed ? [`${label} ${elapsed}`] : [];
  });
  return timings.length === 0 ? prefix : joinBacklogSuffix(prefix, `body internals: ${timings.join(', ')}`);
}

export function syncCheckedPrefix(result: CompanionSyncPassInput) {
  return (result.syncedContentBlobHashes?.length ?? 0) > 0 || (result.syncedAttachmentIds?.length ?? 0) > 0
    ? 'Sync made progress'
    : 'Sync checked';
}

export function appendBacklogSuffix(prefix: string, result: CompanionSyncPassInput) {
  const remainingBodies = result.remainingContentBlobCount;
  const remainingAttachments = result.remainingAttachmentResourceCount;
  const bodyLabel = formatBacklogLabel('topic bodies', remainingBodies, result.remainingContentBlobBytes);
  const attachmentLabel = formatBacklogLabel('attachment files', remainingAttachments, result.remainingAttachmentResourceBytes);
  const suffixes: string[] = [];
  const failedBodies = result.remainingFailedContentBlobCount ?? 0;
  const failedAttachments = result.remainingFailedAttachmentResourceCount ?? 0;
  if (isKnownBacklog(remainingBodies) && isKnownBacklog(remainingAttachments)) {
    suffixes.push(`${bodyLabel} and ${attachmentLabel} ${resourceBacklogVerb(result)}`);
  } else if (isKnownBacklog(remainingBodies)) {
    suffixes.push(`${bodyLabel} ${resourceBacklogVerb(result)}`);
  } else if (isKnownBacklog(remainingAttachments)) {
    suffixes.push(`${attachmentLabel} ${resourceBacklogVerb(result)}`);
  }
  if (failedBodies > 0) {
    suffixes.push(`${formatDownloadLabel(failedBodies, 'topic body download', 'topic body downloads', result.remainingFailedContentBlobBytes)} failed earlier`);
  }
  if (failedAttachments > 0) {
    suffixes.push(`${formatDownloadLabel(failedAttachments, 'attachment download', 'attachment downloads', result.remainingFailedAttachmentResourceBytes)} failed earlier`);
  }
  return suffixes.length === 0 ? prefix : joinBacklogSuffix(prefix, `${joinPhrases(suffixes)}.`);
}

function resourceBacklogVerb(result: CompanionSyncPassInput) {
  return syncCheckedPrefix(result) === 'Sync made progress' ? 'still downloading' : 'left to download';
}

function isKnownBacklog(count: number | null) {
  return typeof count === 'number' && count > 0;
}
