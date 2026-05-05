export interface CompanionSyncPassInput {
  attachmentResourceError: string | null;
  contentBlobError: string | null;
  localDirtyCount?: number | null;
  pendingAckCount?: number | null;
  pushConflictCount?: number;
  pushError?: string | null;
  pushRejectedCount?: number;
  remainingAttachmentResourceBytes?: number | null;
  remainingAttachmentResourceCount: number | null;
  remainingContentBlobBytes?: number | null;
  remainingContentBlobCount: number | null;
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

function joinBacklogSuffix(prefix: string, suffix: string) {
  return `${prefix.replace(/[.;]\s*$/, '')}; ${suffix}`;
}

function appendBacklogSuffix(prefix: string, result: CompanionSyncPassInput) {
  const remainingBodies = result.remainingContentBlobCount;
  const remainingAttachments = result.remainingAttachmentResourceCount;
  const bodyLabel = formatBacklogLabel('topic bodies', remainingBodies, result.remainingContentBlobBytes);
  const attachmentLabel = formatBacklogLabel('attachment files', remainingAttachments, result.remainingAttachmentResourceBytes);
  if (remainingBodies === 0 && remainingAttachments === 0) return prefix;
  if (remainingBodies === 0) return joinBacklogSuffix(prefix, `${attachmentLabel} still caching.`);
  if (remainingAttachments === 0) return joinBacklogSuffix(prefix, `${bodyLabel} still caching.`);
  return joinBacklogSuffix(prefix, `${bodyLabel} and ${attachmentLabel} still caching.`);
}

function createPassResult(message: string, status: CompanionSyncPassResult['status']): CompanionSyncPassResult {
  return { message, outcome: status, status };
}

export function describeCompanionSyncPassResult(result: CompanionSyncPassInput): CompanionSyncPassResult {
  if (result.attachmentResourceError) {
    return createPassResult(`Attachment cache failed: ${result.attachmentResourceError}`, 'failed');
  }
  if (result.contentBlobError) {
    return createPassResult(`Topic body cache failed: ${result.contentBlobError}`, 'failed');
  }
  if (result.pushError) {
    return createPassResult(
      appendBacklogSuffix(`Sync pass finished; device changes could not be sent: ${result.pushError}`, result),
      'skipped'
    );
  }
  const rejectedOrConflicted = (result.pushConflictCount ?? 0) + (result.pushRejectedCount ?? 0);
  if (rejectedOrConflicted > 0) {
    return createPassResult(
      appendBacklogSuffix(`Sync pass finished; ${rejectedOrConflicted} device change(s) need review before they can be sent.`, result),
      'skipped'
    );
  }
  if (
    result.remainingContentBlobCount === 0 &&
    result.remainingAttachmentResourceCount === 0 &&
    result.localDirtyCount === 0 &&
    result.pendingAckCount === 0
  ) {
    return createPassResult('Sync completed.', 'completed');
  }
  if (result.remainingContentBlobCount === 0 && result.remainingAttachmentResourceCount === 0) {
    return createPassResult('Sync pass finished; local changes are still waiting to settle.', 'skipped');
  }
  return createPassResult(appendBacklogSuffix('Sync pass finished', result), 'skipped');
}
