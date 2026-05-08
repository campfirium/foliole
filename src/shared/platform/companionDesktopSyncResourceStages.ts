import {
  pullMissingAttachmentResources,
  pullMissingContentBlobs
} from './companionDesktopSyncResources';
import type { CompanionDesktopSyncOptions } from './companionDesktopSyncTypes';
import {
  companionSyncTimeoutOwnership,
  createCompanionSyncTimeoutError,
  type CompanionSyncTimeoutKey
} from './companionSyncTimeoutOwnership';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Desktop content blob sync failed.';
}

async function withResourceTimeout<T>(key: CompanionSyncTimeoutKey, work: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createCompanionSyncTimeoutError(key));
    }, companionSyncTimeoutOwnership(key).timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function pullContentStage(endpointUrl: string, onProgress?: CompanionDesktopSyncOptions['onProgress']) {
  const startedAt = Date.now();
  const blobs = await withResourceTimeout(
    'content_body_downloads',
    pullMissingContentBlobs(endpointUrl, onProgress)
  );
  return { ...blobs, syncedContentBlobElapsedMs: Date.now() - startedAt };
}

async function pullAttachmentStage(endpointUrl: string, onProgress?: CompanionDesktopSyncOptions['onProgress']) {
  const startedAt = Date.now();
  const attachments = await withResourceTimeout(
    'attachment_resource_downloads',
    pullMissingAttachmentResources(endpointUrl, onProgress)
  );
  return { ...attachments, syncedAttachmentResourceElapsedMs: Date.now() - startedAt };
}

export async function pullResourceStages(endpointUrl: string, onProgress?: CompanionDesktopSyncOptions['onProgress']) {
  const startedAt = Date.now();
  const content = await pullContentStage(endpointUrl, onProgress)
    .then((value) => ({ reason: null, status: 'fulfilled' as const, value }))
    .catch((reason) => ({ reason, status: 'rejected' as const, value: null }));
  const attachments = content.status === 'fulfilled' && !content.value.contentBacklogRemaining
    ? await pullAttachmentStage(endpointUrl, onProgress)
      .then((value) => ({ reason: null, status: 'fulfilled' as const, value }))
      .catch((reason) => ({ reason, status: 'rejected' as const, value: null }))
    : { reason: null, status: 'skipped' as const, value: null };
  const contentValue = content.value;
  const attachmentValue = attachments.value;
  return {
    attachmentResourceError: attachments.status === 'rejected' ? errorMessage(attachments.reason) : null,
    contentBlobError: content.status === 'rejected' ? errorMessage(content.reason) : null,
    syncedAttachmentResourceElapsedMs: attachmentValue?.syncedAttachmentResourceElapsedMs ?? 0,
    syncedAttachmentIds: attachmentValue?.syncedAttachmentIds ?? [],
    syncedAttachmentResourceBytes: attachmentValue?.syncedAttachmentResourceBytes ?? 0,
    syncedContentBlobElapsedMs: contentValue?.syncedContentBlobElapsedMs ?? 0,
    syncedContentBlobNativeTiming: contentValue?.syncedContentBlobNativeTiming,
    syncedContentBlobBytes: contentValue?.syncedContentBlobBytes ?? 0,
    syncedContentBlobHashes: contentValue?.syncedContentBlobHashes ?? [],
    syncedResourceElapsedMs: Date.now() - startedAt
  };
}

export function createEmptyResourceStages() {
  return {
    attachmentResourceError: null,
    contentBlobError: null,
    syncedAttachmentResourceElapsedMs: 0,
    syncedAttachmentIds: [],
    syncedAttachmentResourceBytes: 0,
    syncedContentBlobElapsedMs: 0,
    syncedContentBlobBytes: 0,
    syncedContentBlobHashes: [],
    syncedResourceElapsedMs: 0
  };
}

export function createSkippedResourceSummary() {
  return {
    localDirtyCount: 0,
    pendingAckCount: 0,
    pushIssueCount: 0,
    remainingAttachmentBreakdown: undefined,
    remainingAttachmentResourceBytes: null,
    remainingAttachmentResourceCount: null,
    remainingFailedAttachmentResourceBytes: null,
    remainingFailedAttachmentResourceCount: null,
    remainingContentBreakdown: undefined,
    remainingContentBlobBytes: null,
    remainingContentBlobCount: null,
    remainingFailedContentBlobBytes: null,
    remainingFailedContentBlobCount: null,
    remainingStructureChangeCount: 0
  };
}
