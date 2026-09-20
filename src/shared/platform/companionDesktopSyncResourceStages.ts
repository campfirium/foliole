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

async function pullAttachmentStage(endpointUrl: string, onProgress: CompanionDesktopSyncOptions['onProgress'], articleIds: readonly string[]) {
  const startedAt = Date.now();
  const attachments = await withResourceTimeout(
    'attachment_resource_downloads',
    pullMissingAttachmentResources(endpointUrl, onProgress, articleIds)
  );
  return { ...attachments, syncedAttachmentResourceElapsedMs: Date.now() - startedAt };
}

export async function pullResourceStages(endpointUrl: string, onProgress?: CompanionDesktopSyncOptions['onProgress'], articleIds: readonly string[] = []) {
  const startedAt = Date.now();
  const content = await pullContentStage(endpointUrl, onProgress)
    .then((value) => ({ reason: null, status: 'fulfilled' as const, value }))
    .catch((reason) => ({ reason, status: 'rejected' as const, value: null }));
  const attachments = await pullAttachmentStage(endpointUrl, onProgress, articleIds)
      .then((value) => ({ reason: null, status: 'fulfilled' as const, value }))
      .catch((reason) => ({ reason, status: 'rejected' as const, value: null }));
  const contentValue = content.value;
  const attachmentValue = attachments.value;
  return {
    remainingAttachmentResourceCount: attachmentValue?.missingAttachmentCount ?? 0,
    remainingAttachmentResourceBytes: null,
    remainingFailedAttachmentResourceCount: attachmentValue?.missingAttachmentCount ?? 0,
    remainingFailedAttachmentResourceBytes: null,
    remainingAttachmentBreakdown: undefined,
    attachmentResourceError: attachments.status === 'rejected' ? errorMessage(attachments.reason) : null,
    contentBlobError: content.status === 'rejected' ? errorMessage(content.reason) : null,
    syncedAttachmentResourceElapsedMs: attachmentValue?.syncedAttachmentResourceElapsedMs ?? 0,
    syncedAttachmentIds: attachmentValue?.syncedAttachmentIds ?? [],
    syncedAttachmentResourceBytes: attachmentValue?.syncedAttachmentResourceBytes ?? 0,
    syncedContentBlobElapsedMs: contentValue?.syncedContentBlobElapsedMs ?? 0,
    ...(contentValue?.syncedContentBlobNativeTiming ? { syncedContentBlobNativeTiming: contentValue.syncedContentBlobNativeTiming } : {}),
    syncedContentBlobBytes: contentValue?.syncedContentBlobBytes ?? 0,
    syncedContentBlobHashes: contentValue?.syncedContentBlobHashes ?? [],
    syncedResourceElapsedMs: Date.now() - startedAt
  };
}

export function createEmptyResourceStages() {
  return {
    remainingAttachmentResourceCount: 0,
    remainingAttachmentResourceBytes: null,
    remainingFailedAttachmentResourceCount: 0,
    remainingFailedAttachmentResourceBytes: null,
    remainingAttachmentBreakdown: undefined,
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
    remainingAttachmentResourceBytes: null,
    remainingAttachmentResourceCount: null,
    remainingFailedAttachmentResourceBytes: null,
    remainingFailedAttachmentResourceCount: null,
    remainingContentBlobBytes: null,
    remainingContentBlobCount: null,
    remainingFailedContentBlobBytes: null,
    remainingFailedContentBlobCount: null,
    remainingStructureChangeCount: 0
  };
}
