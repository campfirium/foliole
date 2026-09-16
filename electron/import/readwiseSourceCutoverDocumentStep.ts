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
  const timeoutMs = input.dependencies.cutoverDocumentTimeoutMs ?? 150_000;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = input.dependencies.signal
    ? AbortSignal.any([input.dependencies.signal, timeout]) : timeout;
  let stop: (() => void) | undefined;
  try {
    const preparation = prepareReadwiseApiFrozenResources({
      ...input,
      dependencies: { ...input.dependencies, fetchImpl: cutoverResourceFetch(input.dependencies.fetchImpl ?? fetch), signal }
    });
    const cancelled = new Promise<never>((_, reject) => {
      stop = () => reject(new Error('readwise_source_cutover_document_timeout'));
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
    });
    return await Promise.race([preparation, cancelled]);
  } catch (error) {
    if (timeout.aborted) throw new Error('readwise_source_cutover_document_timeout');
    throw error;
  } finally {
    if (stop) signal.removeEventListener('abort', stop);
  }
}

export function readwiseCutoverDocumentFailureReason(error: unknown) {
  if (!(error instanceof Error)) return 'request_failed';
  return error.message.trim().slice(0, 240) || 'request_failed';
}
