import {
  loadDesktopSyncDiagnostics,
  loadLocalSyncDiagnostics
} from './companion/sync/diagnostics/companionSyncDiagnostics';
import type { CompanionDesktopSyncProgress } from './companionDesktopSyncTypes';

type AttachmentBreakdown = NonNullable<CompanionDesktopSyncProgress['attachmentBreakdown']>;
type ContentBreakdown = NonNullable<CompanionDesktopSyncProgress['contentBreakdown']>;

function compactBreakdown<T extends Record<string, number | undefined>>(values: T) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

export async function loadCompanionDesktopSyncSummary(
  endpointUrl: string,
  confirmedStructureStateSeq: number | null = null
) {
  const diagnostics = await loadLocalSyncDiagnostics().catch(() => null);
  const desktopDiagnostics = await loadDesktopSyncDiagnostics(endpointUrl).catch(() => null);
  const desktopStateSeq = desktopDiagnostics?.sync_state?.max_state_seq;
  const androidCursor = diagnostics?.sync_state?.pack_cursor;
  const structureTarget = confirmedStructureStateSeq ?? desktopStateSeq;
  return {
    localDirtyCount: diagnostics?.sync_state?.local_dirty_count ?? null,
    pendingAckCount: diagnostics?.sync_state?.pending_ack_count ?? null,
    pushIssueCount: diagnostics?.sync_state?.push_issue_count ?? null,
    ...(diagnostics ? { remainingAttachmentBreakdown: compactBreakdown({
      activeTopicAttachments: diagnostics.content?.missing_active_topic_attachment_resource_count,
      dueReviewAttachments: diagnostics.content?.missing_due_review_attachment_resource_count,
      imageAttachments: diagnostics.content?.missing_image_attachment_resource_count,
      imageBytes: diagnostics.content?.missing_image_attachment_resource_bytes,
      otherAttachments: diagnostics.content?.missing_other_attachment_resource_count,
      otherBytes: diagnostics.content?.missing_other_attachment_resource_bytes,
      pdfAttachments: diagnostics.content?.missing_pdf_attachment_resource_count,
      pdfBytes: diagnostics.content?.missing_pdf_attachment_resource_bytes
    }) as AttachmentBreakdown } : {}),
    remainingAttachmentResourceBytes: diagnostics?.content?.missing_attachment_resource_bytes ?? null,
    remainingAttachmentResourceCount: diagnostics?.content?.missing_attachment_resource_count ?? null,
    remainingFailedAttachmentResourceBytes: diagnostics?.content?.failed_attachment_resource_bytes ?? null,
    remainingFailedAttachmentResourceCount: diagnostics?.content?.failed_attachment_resource_count ?? null,
    ...(diagnostics ? { remainingContentBreakdown: compactBreakdown({
      activeTopicBodies: diagnostics.content?.missing_active_topic_body_count,
      dueReviewBodies: diagnostics.content?.missing_due_review_body_count,
      externalDocumentBodies: diagnostics.content?.missing_external_document_body_count,
      nestedTopicBodies: diagnostics.content?.missing_nested_topic_body_count,
      topLevelTopicBodies: diagnostics.content?.missing_top_level_topic_body_count,
      topicBodies: diagnostics.content?.missing_topic_body_count
    }) as ContentBreakdown } : {}),
    remainingContentBlobBytes: diagnostics?.content?.missing_content_blob_bytes ?? null,
    remainingContentBlobCount: diagnostics?.content?.missing_content_blob_count ?? null,
    remainingFailedContentBlobBytes: diagnostics?.content?.failed_content_blob_bytes ?? null,
    remainingFailedContentBlobCount: diagnostics?.content?.failed_content_blob_count ?? null,
    remainingStructureChangeCount: typeof structureTarget === 'number' && typeof androidCursor === 'number'
      ? Math.max(0, structureTarget - androidCursor)
      : null
  };
}
