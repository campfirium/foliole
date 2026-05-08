export interface CompanionContentBlobSyncPlugin {
  commitContentBlobBatch(args: { batch_token: string }): Promise<{
    db_elapsed_ms?: number;
    synced_hashes: string[];
  }>;
  downloadContentBlobBatch(args: {
    body: string;
    headers: Record<string, string>;
    url: string;
  }): Promise<{
    batch_token: string;
    failed_hashes?: string[];
    http_elapsed_ms?: number;
    parse_elapsed_ms?: number;
    synced_hashes: string[];
    total_elapsed_ms?: number;
  }>;
}
