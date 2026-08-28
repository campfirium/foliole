import { createIosContentResourceObservations } from './ios-content-resource-acceptance-service.ts';
import { createIosForegroundSyncLifecycleObservations } from './ios-foreground-sync-lifecycle-service.ts';
import { createIosStateWritebackObservations } from './ios-state-writeback-acceptance-observations.ts';
import { createIosSyncPackAcceptanceObservations } from './ios-sync-pack-acceptance-observations.ts';

export function createIosSyncGroupProviderObservations() {
  return {
    acceptance_collected_count: 0,
    acceptance_explicit: false,
    acceptance_request_id: null as string | null,
    accepted_device_id: null as string | null,
    content_resource: createIosContentResourceObservations(),
    foreground_sync_lifecycle: createIosForegroundSyncLifecycleObservations(),
    group_key_absent_before_accept: false,
    last_error: null as string | null,
    redirect_target_hits: 0,
    request_statuses: [] as string[],
    signed_request_count: 0,
    signature_headers_valid: false,
    state_writeback: createIosStateWritebackObservations(),
    sync_pack: createIosSyncPackAcceptanceObservations()
  };
}
