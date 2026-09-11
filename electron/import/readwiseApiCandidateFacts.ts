import { normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';
import { saveReadwiseApiCandidateFacts } from '../database/readwiseApiCandidateStage.js';
import {
  loadReadwiseApiReaderIndex,
  saveReadwiseApiReaderIndexPage
} from '../database/readwiseApiIndexStage.js';

import type { ReadwiseApiCandidate } from './readwiseApiCandidateTypes.js';
import {
  createReadwiseApiRequest,
  READWISE_READER_LIST_URL,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';

export function createReadwiseApiCandidateFactFetcher(
  connectionRef: string,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  const request = createReadwiseApiRequest(dependencies);
  return async (candidate: ReadwiseApiCandidate) => {
    let indexed = loadReadwiseApiReaderIndex(connectionRef);
    let parent = indexed.find((item) => item.id === candidate.documentId && item.htmlContent) ?? null;
    if (!parent) {
      parent = await fetchExact(candidate.documentId, true, request);
      if (parent) saveReadwiseApiReaderIndexPage(connectionRef, [parent]);
      indexed = loadReadwiseApiReaderIndex(connectionRef);
    }
    if (!parent || parent.category !== candidate.readerCategory) {
      throw new Error('readwise_api_candidate_parent_missing');
    }
    const annotationIds = [...candidate.highlightIds, ...(candidate.noteIds ?? [])];
    const known = new Map(indexed.map((item) => [item.id, item]));
    const annotations = annotationIds.flatMap((id) => known.get(id) ?? []);
    if (annotations.length !== annotationIds.length) {
      throw new Error('readwise_api_candidate_annotation_missing');
    }
    saveReadwiseApiCandidateFacts(connectionRef, candidate.documentId, [parent, ...annotations]);
    return 'ready' as const;
  };
}

async function fetchExact(
  id: string,
  withHtmlContent: boolean,
  request: ReturnType<typeof createReadwiseApiRequest>
) {
  const url = new URL(READWISE_READER_LIST_URL);
  url.searchParams.set('id', id);
  if (withHtmlContent) url.searchParams.set('withHtmlContent', 'true');
  const payload = await request(url);
  return values(payload).map(normalizeReaderDocument).find((item) => item?.id === id) ?? null;
}

function values(payload: Record<string, unknown>) {
  return Array.isArray(payload.results) ? payload.results : [];
}
