import type { NativeReadwiseImportRunResult } from '../../lib/platform/nativeImportContract.js';

export function createCancelledReadwiseApiImportResult(): NativeReadwiseImportRunResult {
  return {
    completed_at: new Date().toISOString(), failed_count: 0, imported_count: 0,
    remaining_count: 0, source_count: 0, status: 'cancelled'
  };
}
