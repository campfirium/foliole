import type { CombinedSyncDiagnosticResult } from './companionSyncDiagnostics';

export function syncConvergenceResult(overrides: Partial<CombinedSyncDiagnosticResult> = {}): CombinedSyncDiagnosticResult {
  return {
    android: {
      collected_at: '2026-05-01T00:00:00.000Z',
      connection: { endpoint_url: 'http://10.0.2.2:38641', last_error: null, state: 'ready' },
      content: { missing_content_blob_count: 0 },
      events: [],
      host: 'android',
      identity: { app_version: null, device_id: 'android' },
      storage: { active_node_count: 1, content_blob_count: 1, external_document_count: 0, missing_node_state_count: 0, missing_node_version_count: 0, node_blob_references_missing_rows: 0 },
      sync_state: { local_dirty_count: 0, max_state_seq: 10, pack_cursor: 10, pending_ack_count: 0, state_counts: [] },
      verdicts: []
    },
    desktop: {
      collected_at: '2026-05-01T00:00:00.000Z',
      connection: { endpoint_url: 'http://127.0.0.1:38641', last_error: null, state: 'running' },
      content: { missing_content_blob_count: 0 },
      events: [],
      host: 'desktop',
      identity: { app_version: '0.1.0', device_id: 'desktop' },
      storage: { active_node_count: 1, content_blob_count: 1, external_document_count: 0, missing_node_state_count: 0, missing_node_version_count: 0, node_blob_references_missing_rows: 0 },
      sync_state: { local_dirty_count: 0, max_state_seq: 10, pack_cursor: null, state_counts: [] },
      verdicts: []
    },
    verdicts: [],
    ...overrides
  };
}
