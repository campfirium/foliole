import { normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';

import {
  createReadwiseApiRequest,
  READWISE_READER_LIST_URL,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';

export async function fetchOriginalEpubRemoteRoot(input: {
  dependencies?: ReadwiseApiFetchDependencies;
  documentId: string;
}) {
  const request = createReadwiseApiRequest(input.dependencies);
  const rootUrl = new URL(READWISE_READER_LIST_URL);
  rootUrl.searchParams.set('id', input.documentId);
  rootUrl.searchParams.set('withRawSourceUrl', 'true');
  const rootPayload = await request(rootUrl);
  const root = (Array.isArray(rootPayload.results) ? rootPayload.results : [])
    .map(normalizeReaderDocument).find((document) => document?.id === input.documentId) ?? null;
  if (!root || root.category !== 'epub') throw new Error('original_epub_target_missing');
  if (!root.rawSourceUrl) throw new Error('original_epub_not_distributed');
  return { rawSourceUrl: root.rawSourceUrl };
}
