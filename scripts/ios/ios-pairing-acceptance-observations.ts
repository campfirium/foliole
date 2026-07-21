import { createIosContentResourceObservations } from './ios-content-resource-acceptance-service.ts';
import { createIosStateWritebackObservations } from './ios-state-writeback-acceptance-observations.ts';
import { createIosSyncPackAcceptanceObservations } from './ios-sync-pack-acceptance-observations.ts';

export function createIosPairingAcceptanceObservations() {
  return {
    content_resource: createIosContentResourceObservations(),
    last_error: null as string | null,
    pair_completed: false,
    pair_requested: false,
    redirect_target_hits: 0,
    signed_request_count: 0,
    signature_headers_valid: false,
    state_writeback: createIosStateWritebackObservations(),
    sync_pack: createIosSyncPackAcceptanceObservations()
  };
}
