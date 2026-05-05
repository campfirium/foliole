export interface CompanionSyncPassInput {
  attachmentResourceError: string | null;
  contentBlobError: string | null;
  localDirtyCount?: number | null;
  pendingAckCount?: number | null;
  pushConflictCount?: number;
  pushError?: string | null;
  pushIssueCount?: number | null;
  pushRejectedCount?: number;
  syncedAttachmentIds?: string[];
  syncedAttachmentResourceBytes?: number;
  syncedContentBlobBytes?: number;
  syncedContentBlobHashes?: string[];
  syncedResourceElapsedMs?: number;
  remainingAttachmentBreakdown?: {
    activeTopicAttachments?: number;
    dueReviewAttachments?: number;
    imageAttachments?: number;
    imageBytes?: number;
    otherAttachments?: number;
    otherBytes?: number;
    pdfAttachments?: number;
    pdfBytes?: number;
  };
  remainingAttachmentResourceBytes?: number | null;
  remainingAttachmentResourceCount: number | null;
  remainingContentBreakdown?: {
    activeTopicBodies?: number;
    dueReviewBodies?: number;
    externalDocumentBodies?: number;
    nestedTopicBodies?: number;
    topLevelTopicBodies?: number;
    topicBodies?: number;
  };
  remainingContentBlobBytes?: number | null;
  remainingContentBlobCount: number | null;
  remainingStructureChangeCount?: number | null;
}

export interface CompanionSyncPassResult {
  message: string;
  outcome: 'completed' | 'failed' | 'skipped';
  status: 'completed' | 'failed' | 'skipped';
}

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
  if (typeof elapsedMs !== 'number' || elapsedMs < 1000) return null;
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function joinBacklogSuffix(prefix: string, suffix: string) {
  return `${prefix.replace(/[.;]\s*$/, '')}; ${suffix}`;
}

function appendDownloadSuffix(prefix: string, result: CompanionSyncPassInput) {
  const bodyCount = result.syncedContentBlobHashes?.length ?? 0;
  const attachmentCount = result.syncedAttachmentIds?.length ?? 0;
  const suffixes: string[] = [];
  if (bodyCount > 0) {
    suffixes.push(formatDownloadLabel(bodyCount, 'topic body', 'topic bodies', result.syncedContentBlobBytes));
  }
  if (attachmentCount > 0) {
    suffixes.push(formatDownloadLabel(
      attachmentCount,
      'attachment file',
      'attachment files',
      result.syncedAttachmentResourceBytes
    ));
  }
  if (suffixes.length === 0) return prefix;
  const elapsed = formatElapsedTime(result.syncedResourceElapsedMs);
  const timeSuffix = elapsed ? ` in ${elapsed}` : '';
  return joinBacklogSuffix(prefix, `downloaded ${suffixes.join(' and ')} in this sync${timeSuffix}`);
}

function syncCheckedPrefix(result: CompanionSyncPassInput) {
  return (result.syncedContentBlobHashes?.length ?? 0) > 0 || (result.syncedAttachmentIds?.length ?? 0) > 0
    ? 'Sync made progress'
    : 'Sync checked';
}

function resourceBacklogVerb(result: CompanionSyncPassInput) {
  return syncCheckedPrefix(result) === 'Sync made progress' ? 'still downloading' : 'left to download';
}

function appendBacklogSuffix(prefix: string, result: CompanionSyncPassInput) {
  const remainingBodies = result.remainingContentBlobCount;
  const remainingAttachments = result.remainingAttachmentResourceCount;
  const remainingStructure = result.remainingStructureChangeCount === undefined ? 0 : result.remainingStructureChangeCount;
  const bodyLabel = formatBacklogLabel('topic bodies', remainingBodies, result.remainingContentBlobBytes);
  const attachmentLabel = formatBacklogLabel('attachment files', remainingAttachments, result.remainingAttachmentResourceBytes);
  const suffixes: string[] = [];
  if (typeof remainingStructure === 'number' && remainingStructure > 0) {
    suffixes.push(`${formatCount(remainingStructure, 'topic list change is', 'topic list changes are')} still applying`);
  } else if (remainingStructure === null) {
    suffixes.push('topic list confirmation is still pending');
  }
  if (isKnownBacklog(remainingBodies) && isKnownBacklog(remainingAttachments)) {
    suffixes.push(`${bodyLabel} and ${attachmentLabel} ${resourceBacklogVerb(result)}`);
  } else if (isKnownBacklog(remainingBodies)) {
    suffixes.push(`${bodyLabel} ${resourceBacklogVerb(result)}`);
  } else if (isKnownBacklog(remainingAttachments)) {
    suffixes.push(`${attachmentLabel} ${resourceBacklogVerb(result)}`);
  }
  return suffixes.length === 0 ? prefix : joinBacklogSuffix(prefix, `${suffixes.join(', and ')}.`);
}

function createPassResult(message: string, status: CompanionSyncPassResult['status']): CompanionSyncPassResult {
  return { message, outcome: status, status };
}

function hasRemainingResourceBacklog(result: CompanionSyncPassInput) {
  return isKnownBacklog(result.remainingContentBlobCount) || isKnownBacklog(result.remainingAttachmentResourceCount);
}

function isKnownBacklog(count: number | null) {
  return typeof count === 'number' && count > 0;
}

export function describeCompanionSyncPassResult(result: CompanionSyncPassInput): CompanionSyncPassResult {
  if (result.attachmentResourceError) {
    if (hasRemainingResourceBacklog(result)) {
      return createPassResult(
        appendBacklogSuffix(`Sync checked; attachment files could not download in this pass: ${result.attachmentResourceError}`, result),
        'skipped'
      );
    }
    return createPassResult(`Attachment download failed: ${result.attachmentResourceError}`, 'failed');
  }
  if (result.contentBlobError) {
    if (hasRemainingResourceBacklog(result)) {
      return createPassResult(
        appendBacklogSuffix(`Sync checked; topic bodies could not download in this pass: ${result.contentBlobError}`, result),
        'skipped'
      );
    }
    return createPassResult(`Topic body download failed: ${result.contentBlobError}`, 'failed');
  }
  if (result.pushError) {
    return createPassResult(
      appendBacklogSuffix(appendDownloadSuffix(`${syncCheckedPrefix(result)}; device changes could not be sent: ${result.pushError}`, result), result),
      'skipped'
    );
  }
  const rejectedOrConflicted = Math.max(
    result.pushIssueCount ?? 0,
    (result.pushConflictCount ?? 0) + (result.pushRejectedCount ?? 0)
  );
  if (rejectedOrConflicted > 0) {
    return createPassResult(
      appendBacklogSuffix(
        appendDownloadSuffix(
          `${syncCheckedPrefix(result)}; ${formatCount(rejectedOrConflicted, 'device change', 'device changes')} ${rejectedOrConflicted === 1 ? 'needs' : 'need'} review before sending.`,
          result
        ),
        result
      ),
      'skipped'
    );
  }
  if (
    result.remainingContentBlobCount === 0 &&
    result.remainingAttachmentResourceCount === 0 &&
    (result.remainingStructureChangeCount === undefined || result.remainingStructureChangeCount === 0) &&
    result.localDirtyCount === 0 &&
    result.pendingAckCount === 0
  ) {
    return createPassResult(appendDownloadSuffix('Sync fully completed.', result), 'completed');
  }
  if (
    result.remainingContentBlobCount === 0 &&
    result.remainingAttachmentResourceCount === 0 &&
    (result.remainingStructureChangeCount === undefined || result.remainingStructureChangeCount === 0)
  ) {
    return createPassResult(appendDownloadSuffix(`${syncCheckedPrefix(result)}; local changes are still waiting to settle.`, result), 'skipped');
  }
  return createPassResult(appendBacklogSuffix(appendDownloadSuffix(syncCheckedPrefix(result), result), result), 'skipped');
}
