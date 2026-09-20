import type { ResourceFailure } from '../../../lib/platform/resourceAvailabilityContract';

export interface CompanionContentBlobSyncPlugin {
  downloadContentBlobBatch(args: {
    body: string;
    headers: Record<string, string>;
    url: string;
  }): Promise<{
    batch_token: string;
    failed_hashes?: string[];
    failed_hash_errors?: Record<string, ResourceFailure>;
      http_elapsed_ms?: number;
      pack_path?: string;
      parse_elapsed_ms?: number;
    synced_hashes: string[];
    total_elapsed_ms?: number;
  }>;
  finishContentBlobBatch(args: { batch_token: string; committed: boolean }): Promise<Record<string, never>>;
}
