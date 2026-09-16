import type { ReadwiseImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';

import { prepareReadwiseApiFrozenResources } from './readwiseApiFrozenBatch.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { cutoverResourceFetch } from './readwiseCutoverResourceFetch.js';

export async function prepareReadwiseCutoverResources(input: {
  config: ReadwiseReaderConfig;
  connectionRef: string;
  dependencies: ReadwiseApiFetchDependencies;
  destination: Exclude<ReadwiseImportDestination, 'off'>;
  document: PreparedReadwiseApiDocument;
  requireFreshOriginalFile?: boolean;
}) {
  return prepareReadwiseApiFrozenResources({
    ...input,
    dependencies: {
      ...input.dependencies,
      fetchImpl: cutoverResourceFetch(input.dependencies.fetchImpl ?? fetch)
    }
  });
}

export function readwiseCutoverDocumentFailureReason(error: unknown) {
  if (!(error instanceof Error)) return 'request_failed';
  return error.message.trim().slice(0, 240) || 'request_failed';
}
