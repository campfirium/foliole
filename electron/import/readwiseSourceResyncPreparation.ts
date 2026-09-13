import { normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';
import {
  prepareReadwiseApiDocuments,
  type PreparedReadwiseApiDocument
} from '../../lib/core/readwise/readwiseApiImport.js';

import { prepareReadwiseApiEpubCover } from './readwiseApiEpubCover.js';
import { prepareReadwiseApiEpubImages } from './readwiseApiEpubImages.js';
import {
  createReadwiseApiRequest,
  READWISE_READER_LIST_URL,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';
import { mergeRetainedReadwiseAnnotations } from './readwiseOriginalEpubAnnotations.js';
import type { ReadwiseSourceResyncTarget } from './readwiseSourceResyncTarget.js';

export interface PreparedReadwiseSourceResync {
  cover: Awaited<ReturnType<typeof prepareReadwiseApiEpubCover>> | null;
  document: PreparedReadwiseApiDocument;
  images: Awaited<ReturnType<typeof prepareReadwiseApiEpubImages>>;
}

export async function prepareReadwiseSourceResync(
  target: ReadwiseSourceResyncTarget,
  dependencies: ReadwiseApiFetchDependencies = {}
): Promise<PreparedReadwiseSourceResync> {
  const request = createReadwiseApiRequest(dependencies);
  const url = new URL(READWISE_READER_LIST_URL);
  url.searchParams.set('id', target.documentId);
  url.searchParams.set('withHtmlContent', 'true');
  const payload = await request(url);
  const remote = values(payload).map(normalizeReaderDocument)
    .find((document) => document?.id === target.documentId) ?? null;
  if (!remote) throw new Error('readwise_resync_source_missing');
  const prepared = prepareReadwiseApiDocuments([remote], [])[0];
  if (!prepared?.body.trim()) throw new Error('readwise_resync_body_unavailable');
  if (prepared.category === 'epub' && !prepared.epubStructure) {
    throw new Error('readwise_resync_epub_structure_missing');
  }
  const document = {
    ...prepared,
    annotations: mergeRetainedReadwiseAnnotations(target, prepared.annotations)
  };
  if (document.category !== 'epub') return { cover: null, document, images: null };
  const [cover, images] = await Promise.all([
    prepareReadwiseApiEpubCover(document),
    prepareReadwiseApiEpubImages(document)
  ]);
  if (cover.degradedReason || images?.degradedReason) {
    throw new Error('readwise_resync_epub_resources_incomplete');
  }
  return { cover, document, images };
}

function values(payload: Record<string, unknown>) {
  return Array.isArray(payload.results) ? payload.results : [];
}
