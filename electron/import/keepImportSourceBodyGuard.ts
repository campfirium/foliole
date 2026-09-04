import { NodeBodyUnavailableError } from '../../lib/core/database/nodeBodyResolution.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import type { KeepImportRunEntry } from './keepImportReadwiseLogging.js';

export async function guardKeepImportSourceBody<T extends KeepImportRunEntry>(
  source: DirectoryImportSourceDescriptor,
  run: () => Promise<T>
): Promise<T | KeepImportRunEntry> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof NodeBodyUnavailableError)) {
      throw error;
    }
    return {
      action: 'skipped',
      detail: error.message,
      failureReason: error.message,
      importStatus: null,
      previewStatus: 'failed',
      sourcePath: source.sourceName
    };
  }
}
