import type { ReadwiseAutoImportPolicy } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import { resolveReadwiseAutoImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';

import {
  READER_PARENT_CATEGORIES,
  type ReadwiseApiIndexScope,
  type ReaderParentCategory
} from './readwiseApiCandidateTypes.js';
import { READWISE_EXPORT_URL, READWISE_READER_LIST_URL } from './readwiseApiImportFetch.js';

export function createReadwiseApiIndexPlan(policy: ReadwiseAutoImportPolicy): ReadwiseApiIndexScope[] {
  const categoryScopes = READER_PARENT_CATEGORIES.filter((category) =>
    resolveReadwiseAutoImportDestination(policy, category, false) !== 'off'
  ).map((category): ReadwiseApiIndexScope => `reader:${category}`);
  return [
    'reader:highlight',
    'reader:note',
    ...categoryScopes,
    ...(policy.importTag.trim() ? ['reader:tag' as const] : []),
    'export'
  ];
}

export function readwiseApiScopePolicySignature(
  scope: ReadwiseApiIndexScope,
  policy: ReadwiseAutoImportPolicy
) {
  const highlightedDestinations = READER_PARENT_CATEGORIES.map((category) =>
    `${category}:${resolveReadwiseAutoImportDestination(policy, category, true)}`
  ).join('|');
  if (scope === 'reader:highlight') return highlightedDestinations;
  if (scope === 'reader:tag') return `${policy.importTag.trim()}|${highlightedDestinations}`;
  if (scope.startsWith('reader:') && isParentCategory(scope.slice('reader:'.length))) {
    const category = scope.slice('reader:'.length) as ReaderParentCategory;
    return `${category}:${resolveReadwiseAutoImportDestination(policy, category, false)}`;
  }
  return scope;
}

export function buildReadwiseApiScopeUrl(input: {
  checkpoint: string | null;
  cursor: string | null;
  importTag: string;
  scope: ReadwiseApiIndexScope;
}) {
  const url = new URL(input.scope === 'export' ? READWISE_EXPORT_URL : READWISE_READER_LIST_URL);
  if (input.checkpoint) url.searchParams.set('updatedAfter', input.checkpoint);
  if (input.cursor) url.searchParams.set('pageCursor', input.cursor);
  if (input.scope === 'export') return url;
  url.searchParams.set('limit', '100');
  if (input.scope === 'reader:tag') {
    url.searchParams.set('tag', input.importTag.trim());
    url.searchParams.set('withHtmlContent', 'true');
  } else {
    const category = input.scope.slice('reader:'.length);
    url.searchParams.set('category', category);
    if (isParentCategory(category)) url.searchParams.set('withHtmlContent', 'true');
  }
  return url;
}

function isParentCategory(value: string): value is ReaderParentCategory {
  return READER_PARENT_CATEGORIES.includes(value as ReaderParentCategory);
}
