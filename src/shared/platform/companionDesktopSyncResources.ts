import { invalidateAttachmentResourceResolution } from './attachmentResources';
import { loadLocalSyncDiagnostics } from './companion/sync/diagnostics/companionSyncDiagnostics';
import { syncCompanionAttachmentResourceRequestsFromDesktop } from './companionDesktopAttachmentResources';
import type { CompanionDesktopSyncProgress } from './companionDesktopSyncTypes';
import {
  loadCompanionMissingAttachmentResources
} from './companionSyncObjects';

export const ATTACHMENT_RESOURCE_BATCH_LIMIT = 64;
const ATTACHMENT_RESOURCE_MAX_BATCHES_PER_SYNC = 20;
export { COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS, CONTENT_BLOB_BATCH_LIMIT, CONTENT_BLOB_CONCURRENT_FETCH_LIMIT, pullMissingContentBlobs, syncCompanionContentBlobFromDesktop } from './companionDesktopSyncContentBlobs';

type ProgressHandler = (progress: CompanionDesktopSyncProgress) => void;
type AttachmentBreakdown = NonNullable<CompanionDesktopSyncProgress['attachmentBreakdown']>;

function knownNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value : undefined;
}

function compactAttachmentBreakdown(values: Record<keyof AttachmentBreakdown, number | undefined>): AttachmentBreakdown {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as AttachmentBreakdown;
}

async function loadMissingAttachmentResourceSummary() {
  const diagnostics = await loadLocalSyncDiagnostics().catch(() => null);
  return {
    attachmentBreakdown: diagnostics ? compactAttachmentBreakdown({
      activeTopicAttachments: diagnostics.content.missing_active_topic_attachment_resource_count,
      dueReviewAttachments: diagnostics.content.missing_due_review_attachment_resource_count,
      imageAttachments: diagnostics.content.missing_image_attachment_resource_count,
      imageBytes: diagnostics.content.missing_image_attachment_resource_bytes,
      otherAttachments: diagnostics.content.missing_other_attachment_resource_count,
      otherBytes: diagnostics.content.missing_other_attachment_resource_bytes,
      pdfAttachments: diagnostics.content.missing_pdf_attachment_resource_count,
      pdfBytes: diagnostics.content.missing_pdf_attachment_resource_bytes
    }) : undefined,
    failed: diagnostics?.content.failed_attachment_resource_count ?? null,
    failedBytes: diagnostics?.content.failed_attachment_resource_bytes ?? null,
    total: diagnostics?.content.missing_attachment_resource_count ?? null,
    totalBytes: diagnostics?.content.missing_attachment_resource_bytes ?? null
  };
}

export async function pullMissingAttachmentResources(endpointUrl: string, onProgress?: ProgressHandler) {
  const startedAt = Date.now();
  const { attachmentBreakdown, failed, failedBytes, total, totalBytes } = await loadMissingAttachmentResourceSummary();
  const syncedAttachmentIds: string[] = [];
  let syncedBytes = 0;
  const failedAttachmentBytes = knownNumber(failedBytes);
  const failedAttachmentCount = knownNumber(failed);
  const progressBase = {
    ...(attachmentBreakdown ? { attachmentBreakdown } : {}),
    ...(failedAttachmentBytes !== undefined ? { failedBytes: failedAttachmentBytes } : {}),
    ...(failedAttachmentCount !== undefined ? { failedCount: failedAttachmentCount } : {}),
    phase: 'attachment' as const,
    total,
    totalBytes
  };
  onProgress?.({ ...progressBase, completed: 0, completedBytes: 0, elapsedMs: 0 });
  for (let batchIndex = 0; batchIndex < ATTACHMENT_RESOURCE_MAX_BATCHES_PER_SYNC; batchIndex += 1) {
    if (batchIndex > 0 && Date.now() - startedAt >= 45_000) {
      break;
    }
    const resources = await loadCompanionMissingAttachmentResources(ATTACHMENT_RESOURCE_BATCH_LIMIT);
    if (resources.length === 0) break;
    let syncedBatchIds: string[];
    const sizeByAttachmentId = new Map(resources.map((resource) => [
      resource.attachment_id,
      Math.max(0, resource.size_bytes ?? 0)
    ]));
    try {
      syncedBatchIds = await syncCompanionAttachmentResourceRequestsFromDesktop(
        endpointUrl,
        resources.map((resource) => ({
          attachmentId: resource.attachment_id,
          contentHash: resource.content_hash
        })),
        (syncedChunkIds) => {
          syncedAttachmentIds.push(...syncedChunkIds);
          for (const attachmentId of syncedChunkIds) {
            invalidateAttachmentResourceResolution(attachmentId);
          }
          syncedBytes += syncedChunkIds.reduce((sum, attachmentId) => sum + (sizeByAttachmentId.get(attachmentId) ?? 0), 0);
          onProgress?.({ ...progressBase, completed: syncedAttachmentIds.length, completedBytes: syncedBytes, elapsedMs: Date.now() - startedAt });
        }
      );
    } catch (error) {
      if (syncedAttachmentIds.length > 0) break;
      throw error;
    }
    if (syncedBatchIds.length === 0) {
      if (syncedAttachmentIds.length > 0) break;
      throw new Error('Attachment file batch could not download any requested file.');
    }
    if (resources.length < ATTACHMENT_RESOURCE_BATCH_LIMIT || syncedBatchIds.length === 0) break;
  }
  return { syncedAttachmentResourceBytes: syncedBytes, syncedAttachmentIds };
}
