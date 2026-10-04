import { syncCompanionIdentityObjects } from './companion/sync/syncGroupIdentityCompanionResult';
import type { CompanionDesktopSyncOptions, CompanionDesktopSyncResult } from './companionDesktopSyncTypes';

export { ATTACHMENT_RESOURCE_BATCH_LIMIT, CONTENT_BLOB_BATCH_LIMIT, syncCompanionContentBlobFromDesktop } from './companionDesktopSyncResources';
export type { CompanionDesktopSyncOptions, CompanionDesktopSyncProgress, CompanionDesktopSyncResult } from './companionDesktopSyncTypes';

const inFlightSyncByEndpoint = new Map<string, Promise<CompanionDesktopSyncResult>>();

export function syncCompanionObjectsFromDesktop(
  endpointUrl: string,
  options: CompanionDesktopSyncOptions = {}
): Promise<CompanionDesktopSyncResult> {
  const cacheKey = endpointUrl.trim();
  const inFlightSync = inFlightSyncByEndpoint.get(cacheKey);
  if (inFlightSync) return inFlightSync;
  const nextSync = syncCompanionIdentityObjects(endpointUrl, options).finally(() => {
    if (inFlightSyncByEndpoint.get(cacheKey) === nextSync) {
      inFlightSyncByEndpoint.delete(cacheKey);
    }
  });
  inFlightSyncByEndpoint.set(cacheKey, nextSync);
  return nextSync;
}
