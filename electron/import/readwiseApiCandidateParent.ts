import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { resolveReadwiseAutoImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import { normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';
import { markReadwiseApiArticleParentUnavailable } from '../database/readwiseApiAnnotationLedger.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import {
  READER_PARENT_CATEGORIES,
  type ReaderParentCategory
} from './readwiseApiCandidateTypes.js';
import {
  READWISE_READER_LIST_URL,
  type createReadwiseApiRequest
} from './readwiseApiImportFetch.js';

export async function resolveReadwiseApiCandidateParent(
  connectionRef: string,
  id: string,
  settings: ImportManagerSettings,
  request: ReturnType<typeof createReadwiseApiRequest>,
  runStartedAt: string
) {
  const existing = existingParent(connectionRef, id);
  if (existing) return existing;
  const allHighlightedEnabled = READER_PARENT_CATEGORIES.every((category) =>
    resolveReadwiseAutoImportDestination(settings.readwiseAutoImportPolicy, category, true) !== 'off'
  );
  const first = await fetchExact(id, allHighlightedEnabled, request);
  if (!first) {
    markReadwiseApiArticleParentUnavailable(connectionRef, id, runStartedAt);
    return null;
  }
  if (!isReaderParentCategory(first.category)) throw identityConflict(id);
  const destination = resolveReadwiseAutoImportDestination(
    settings.readwiseAutoImportPolicy, first.category, true
  );
  if (destination === 'off' || allHighlightedEnabled || first.htmlContent) return first;
  return fetchExact(id, true, request);
}

function existingParent(connectionRef: string, id: string) {
  const existing = loadReadwiseApiImportSource(connectionRef, id);
  const metadata = existing?.state.metadata;
  if (!existing?.body || !metadata || !isReaderParentCategory(metadata.category)) return null;
  return normalizeReaderDocument({
    author: metadata.author,
    category: metadata.category,
    html_content: existing.body,
    id,
    source_url: metadata.sourceUrl,
    title: existing.title ?? metadata.title,
    updated_at: existing.state.sourceUpdatedAt,
    url: metadata.readerUrl
  });
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
  const documents = values(payload).map(normalizeReaderDocument).filter((item) => item !== null);
  const exact = documents.find((item) => item.id === id) ?? null;
  if (!exact && documents.length) throw identityConflict(id);
  return exact;
}

function identityConflict(id: string) {
  return new Error(`readwise_api_parent_identity_conflict:${id}`);
}

function isReaderParentCategory(value: unknown): value is ReaderParentCategory {
  return READER_PARENT_CATEGORIES.includes(value as ReaderParentCategory);
}

function values(payload: Record<string, unknown>) {
  return Array.isArray(payload.results) ? payload.results : [];
}
