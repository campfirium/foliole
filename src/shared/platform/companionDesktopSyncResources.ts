import { invalidateAttachmentResourceResolution, resolveRuntimeAttachmentResource } from './attachmentResources';
import { loadCompanionArticleAttachmentNeeds } from './companion/sync/resources/articleAttachmentNeeds';
import { syncCompanionAttachmentResourceRequestsFromDesktop } from './companionDesktopAttachmentResources';
import type { CompanionDesktopSyncProgress } from './companionDesktopSyncTypes';

export const ATTACHMENT_RESOURCE_BATCH_LIMIT = 6;
export { COMPANION_DESKTOP_SYNC_RESOURCE_PASS_BUDGET_MS, CONTENT_BLOB_BATCH_LIMIT, CONTENT_BLOB_CONCURRENT_FETCH_LIMIT, pullMissingContentBlobs, syncCompanionContentBlobFromDesktop } from './companionDesktopSyncContentBlobs';

type ProgressHandler = (progress: CompanionDesktopSyncProgress) => void;

export async function pullMissingAttachmentResources(
  endpointUrl: string,
  onProgress?: ProgressHandler,
  articleIds: readonly string[] = []
) {
  if (articleIds.length === 0) return { missingAttachmentCount: 0, syncedAttachmentResourceBytes: 0, syncedAttachmentIds: [] as string[] };
  const { needs } = await loadCompanionArticleAttachmentNeeds(endpointUrl, articleIds);
  const requests = [];
  for (const need of needs) {
    const local = await resolveRuntimeAttachmentResource(`asset://${need.storageKey}`, { refresh: true });
    if (local?.status !== 'ready') requests.push(need);
  }
  const startedAt = Date.now();
  const syncedAttachmentIds: string[] = [];
  const sizeById = new Map(requests.map((request) => [request.attachmentId, request.sizeBytes ?? 0]));
  let syncedBytes = 0;
  onProgress?.({ phase: 'attachment', completed: 0, total: requests.length });
  if (requests.length === 0) return { missingAttachmentCount: 0, syncedAttachmentResourceBytes: 0, syncedAttachmentIds };
  await syncCompanionAttachmentResourceRequestsFromDesktop(endpointUrl, requests, (ids) => {
    syncedAttachmentIds.push(...ids);
    syncedBytes += ids.reduce((sum, id) => sum + (sizeById.get(id) ?? 0), 0);
    for (const id of ids) invalidateAttachmentResourceResolution(id);
    onProgress?.({ phase: 'attachment', completed: syncedAttachmentIds.length,
      total: requests.length, completedBytes: syncedBytes, elapsedMs: Date.now() - startedAt });
  });
  return { missingAttachmentCount: requests.length - syncedAttachmentIds.length, syncedAttachmentResourceBytes: syncedBytes, syncedAttachmentIds };
}
